import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { downloadPackagingFile } from '@/lib/packaging/signed-upload'
import { extractPlates, isPdfCompatibleArtwork } from '@/lib/packaging/plates'
import { validatePlatesAgainstLibrary } from '@/lib/packaging/materials'
import {
  logPackagingActivity,
  requirePackagingWrite,
  requirePacketAccess,
  findAccessiblePacket,
} from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    await requirePacketAccess({
      packetId: params.id,
      userId: auth.profile.userId,
      minRole: 'editor',
    })

    const body = await request.json()
    const { componentSlug, kind, storagePath, fileName, mimeType, byteSize } = body
    if (!componentSlug || !kind || !storagePath || !fileName) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    const component = await prisma.packagingComponent.findFirst({
      where: { packetId: params.id, slug: componentSlug },
    })
    if (!component) {
      return NextResponse.json({ error: 'component not found' }, { status: 404 })
    }

    let extractedPlates = null
    let mismatchedMaterialIds: string[] = []
    let extractedAt: Date | null = null

    if (isPdfCompatibleArtwork(fileName, mimeType)) {
      const buf = await downloadPackagingFile(storagePath)
      const plates = await extractPlates(buf)
      extractedPlates = plates
      extractedAt = new Date()
      const validation = await validatePlatesAgainstLibrary(plates)
      mismatchedMaterialIds = validation.mismatchedIds
    }

    const artwork = await prisma.packagingArtwork.create({
      data: {
        componentId: component.id,
        kind,
        fileName,
        storagePath,
        mimeType: mimeType ?? null,
        byteSize: byteSize ?? null,
        extractedPlates: extractedPlates as object | undefined,
        extractedAt,
        mismatchedMaterialIds: mismatchedMaterialIds as object,
        uploadedBy: auth.profile.userId,
      },
    })

    await logPackagingActivity({
      packetId: params.id,
      userId: auth.profile.userId,
      action: 'uploaded_artwork',
      targetId: artwork.id,
      metadata: { componentSlug, kind, fileName },
    })

    const packet = await findAccessiblePacket(params.id)
    return NextResponse.json({ artwork, packet, plates: extractedPlates, mismatchedMaterialIds })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}
