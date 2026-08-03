import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { logPackagingActivity, requirePackagingWrite } from '@/lib/packaging/service'
import { artworkRegisterSchema, zodDetails } from '@/lib/packaging/schema'
import { downloadPackagingFile } from '@/lib/packaging/signed-upload'
import { extractPlates, isPdfCompatibleArtwork, probeArtwork } from '@/lib/packaging/plates'
import { stemOf } from '@/lib/packaging/naming'

export const dynamic = 'force-dynamic'
// Downloading a large .ai and scanning it for plate names takes real time.
export const maxDuration = 120

interface Params {
  params: { id: string }
}

/**
 * Register a file the browser has just uploaded, and — for editable artwork —
 * read the truth out of it: plate names from the .ai's XMP metadata, split
 * into inks / special finishes / structural plates, plus the Print Part Number
 * (the file stem). Those land on the component as machine fields; nobody types
 * them, and the next upload overwrites them. That is the point.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = artworkRegisterSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const { kind, fileName, storagePath, mimeType, byteSize, packetComponentId } = parsed.data

  const packet = await prisma.packagingPacket.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!packet) return packagingError('Packet not found', { status: 404 })

  if (kind !== 'overview' && !packetComponentId) {
    return packagingError('packetComponentId is required for component artwork.')
  }
  if (packetComponentId) {
    const component = await prisma.packagingPacketComponent.findFirst({
      where: { id: packetComponentId, packetId: packet.id },
      select: { id: true },
    })
    if (!component) return packagingError('Component not found on this packet', { status: 404 })
  }

  // Only artwork that claims to be PDF-compatible gets probed/parsed; a mockup
  // PNG is stored as-is.
  const shouldInspect = kind === 'editable_ai' && isPdfCompatibleArtwork(fileName, mimeType)
  let aiCompatible: boolean | null = null
  let pageCount: number | null = null
  let plates: ReturnType<typeof extractPlates> | null = null

  if (shouldInspect) {
    let buffer: Buffer
    try {
      buffer = await downloadPackagingFile(storagePath)
    } catch (err) {
      return packagingError(
        `Uploaded file could not be read back from storage: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
        { status: 502 }
      )
    }
    const probe = await probeArtwork(buffer)
    aiCompatible = probe.aiCompatible
    pageCount = probe.pageCount
    // Plate names live in the XMP stream, readable even when pdf-lib cannot
    // fully parse the document — so extract regardless of the probe result.
    plates = extractPlates(buffer)
  }

  const artwork = await prisma.$transaction(async (tx) => {
    // One artwork per (component, kind): re-uploading replaces, so the
    // component always points at the current file.
    if (packetComponentId) {
      await tx.packagingArtwork.deleteMany({
        where: { packetComponentId, kind },
      })
    } else if (kind === 'overview') {
      await tx.packagingArtwork.deleteMany({ where: { packetId: packet.id, kind: 'overview' } })
    }

    const created = await tx.packagingArtwork.create({
      data: {
        packetId: packet.id,
        packetComponentId: packetComponentId ?? null,
        kind,
        fileName,
        storagePath,
        mimeType: mimeType ?? null,
        byteSize: byteSize ?? null,
        pageCount,
        aiCompatible,
        extractedPlates: plates ? (plates as unknown as object) : undefined,
        extractedAt: plates ? new Date() : null,
        uploadedBy: auth.profile!.userId,
      },
    })

    if (kind === 'overview') {
      await tx.packagingPacket.update({
        where: { id: packet.id },
        data: { overviewArtworkId: created.id },
      })
    }

    if (plates && packetComponentId) {
      await tx.packagingPacketComponent.update({
        where: { id: packetComponentId },
        data: {
          inks: plates.inks,
          finishes: plates.finishes,
          structuralPlates: plates.structural,
          printPartNumber: stemOf(fileName),
          platesSyncedAt: new Date(),
          // A fresh file invalidates whatever brief was generated before.
          supplierPdfError: null,
        },
      })
    }

    return created
  })

  await logPackagingActivity({
    packetId: packet.id,
    userId: auth.profile.userId,
    action: 'uploaded_artwork',
    targetId: artwork.id,
    metadata: {
      kind,
      fileName,
      inks: plates?.inks.length ?? 0,
      finishes: plates?.finishes.length ?? 0,
      structural: plates?.structural.length ?? 0,
      aiCompatible,
    },
  })

  return NextResponse.json({
    artwork: {
      id: artwork.id,
      kind: artwork.kind,
      fileName: artwork.fileName,
      pageCount: artwork.pageCount,
      aiCompatible: artwork.aiCompatible,
    },
    plates,
    printPartNumber: plates && packetComponentId ? stemOf(fileName) : null,
    warning:
      aiCompatible === false
        ? 'This file is not PDF-compatible, so no supplier PDF can be stamped from it. Re-save the .ai with "Create PDF Compatible File" ticked.'
        : null,
  })
}
