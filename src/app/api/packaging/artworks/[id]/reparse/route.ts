import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { logPackagingActivity, requirePackagingWrite } from '@/lib/packaging/service'
import { downloadPackagingFile } from '@/lib/packaging/signed-upload'
import { extractPlates, probeArtwork } from '@/lib/packaging/plates'
import { stemOf } from '@/lib/packaging/naming'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface Params {
  params: { id: string }
}

/**
 * Re-read plate names from a stored .ai. Useful when the keyword vocabulary
 * changes (a new finish or structural term is added) — the file is unchanged,
 * our reading of it isn't.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const artwork = await prisma.packagingArtwork.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      kind: true,
      fileName: true,
      storagePath: true,
      packetId: true,
      packetComponentId: true,
    },
  })
  if (!artwork) return packagingError('Artwork not found', { status: 404 })
  if (artwork.kind !== 'editable_ai') {
    return packagingError('Only editable artwork carries plate metadata.')
  }

  let buffer: Buffer
  try {
    buffer = await downloadPackagingFile(artwork.storagePath)
  } catch (err) {
    return packagingError(
      `Could not read the file from storage: ${err instanceof Error ? err.message : 'unknown'}`,
      { status: 502 }
    )
  }

  const probe = await probeArtwork(buffer)
  const plates = extractPlates(buffer)

  await prisma.$transaction(async (tx) => {
    await tx.packagingArtwork.update({
      where: { id: artwork.id },
      data: {
        pageCount: probe.pageCount,
        aiCompatible: probe.aiCompatible,
        extractedPlates: plates as unknown as object,
        extractedAt: new Date(),
      },
    })
    if (artwork.packetComponentId) {
      await tx.packagingPacketComponent.update({
        where: { id: artwork.packetComponentId },
        data: {
          inks: plates.inks,
          finishes: plates.finishes,
          structuralPlates: plates.structural,
          printPartNumber: stemOf(artwork.fileName),
          platesSyncedAt: new Date(),
        },
      })
    }
  })

  await logPackagingActivity({
    packetId: artwork.packetId,
    userId: auth.profile.userId,
    action: 'reparsed_artwork',
    targetId: artwork.id,
    metadata: {
      inks: plates.inks.length,
      finishes: plates.finishes.length,
      structural: plates.structural.length,
    },
  })

  return NextResponse.json({ plates, aiCompatible: probe.aiCompatible, pageCount: probe.pageCount })
}
