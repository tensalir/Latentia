import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { logPackagingActivity, requirePackagingWrite } from '@/lib/packaging/service'
import { deletePackagingFile } from '@/lib/packaging/signed-upload'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
}

/**
 * Remove an uploaded file. Deleting the editable artwork also clears the
 * machine fields it populated — those values only mean something while the
 * file they were read from is attached.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const artwork = await prisma.packagingArtwork.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, packetId: true, packetComponentId: true, storagePath: true, fileName: true },
  })
  if (!artwork) return packagingError('Artwork not found', { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.packagingArtwork.delete({ where: { id: artwork.id } })

    if (artwork.kind === 'editable_ai' && artwork.packetComponentId) {
      await tx.packagingPacketComponent.update({
        where: { id: artwork.packetComponentId },
        data: {
          inks: [],
          finishes: [],
          structuralPlates: [],
          printPartNumber: null,
          platesSyncedAt: null,
          supplierPdfPath: null,
          supplierPdfUrl: null,
          supplierPdfGeneratedAt: null,
          supplierPdfError: null,
        },
      })
    }
    if (artwork.kind === 'overview') {
      await tx.packagingPacket.update({
        where: { id: artwork.packetId },
        data: { overviewArtworkId: null },
      })
    }
  })

  // Storage cleanup is best-effort: the row is already gone, and an orphaned
  // object is harmless next to a 404 the user can't act on.
  try {
    await deletePackagingFile(artwork.storagePath)
  } catch {
    // ignored
  }

  await logPackagingActivity({
    packetId: artwork.packetId,
    userId: auth.profile.userId,
    action: 'deleted_artwork',
    metadata: { kind: artwork.kind, fileName: artwork.fileName },
  })

  return NextResponse.json({ ok: true })
}
