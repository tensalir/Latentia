import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { downloadPackagingFile, uploadPackagingBuffer, getPackagingSignedDownloadUrl } from '@/lib/packaging/signed-upload'
import { buildSupplierPdfOverlay } from '@/lib/packaging/supplier-pdf'
import { extractPlates } from '@/lib/packaging/plates'
import { supplierPdfStoragePath } from '@/lib/packaging/storage'
import {
  requirePackagingWrite,
  requirePacketAccess,
  logPackagingActivity,
  findAccessiblePacket,
} from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    const component = await prisma.packagingComponent.findUnique({
      where: { id: params.id },
      include: { artworks: true, packet: true },
    })
    if (!component) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    await requirePacketAccess({
      packetId: component.packetId,
      userId: auth.profile.userId,
      minRole: 'editor',
    })

    const editableArt = component.artworks.find(
      (a) =>
        a.fileName.toLowerCase().includes('editable') ||
        a.fileName.toLowerCase().endsWith('.ai') ||
        a.kind === 'Artwork' ||
        a.kind === 'Artwork_Front'
    )
    if (!editableArt) {
      return NextResponse.json(
        { error: 'Upload an editable .ai file for this component first' },
        { status: 400 }
      )
    }

    const buf = await downloadPackagingFile(editableArt.storagePath)
    const plates =
      editableArt.extractedPlates &&
      typeof editableArt.extractedPlates === 'object' &&
      'inks' in (editableArt.extractedPlates as object)
        ? (editableArt.extractedPlates as { inks: string[]; finishes: string[]; dielines: string[]; raw?: string[] })
        : await extractPlates(buf)

    const projectInfo = (component.packet.projectInfo as Record<string, string>) || {}
    const specs = (component.specs as Record<string, string>) || {}

    const pdfBytes = await buildSupplierPdfOverlay({
      artworkBuffer: buf,
      project: projectInfo,
      component: specs,
      componentDisplay: component.displayName,
      plates: {
        inks: plates.inks ?? [],
        finishes: plates.finishes ?? [],
        dielines: plates.dielines ?? [],
        raw: 'raw' in plates ? (plates.raw ?? []) : [],
      },
    })

    const path = supplierPdfStoragePath(auth.profile.userId, component.packetId, component.slug)
    await uploadPackagingBuffer({
      path,
      buffer: Buffer.from(pdfBytes),
      contentType: 'application/pdf',
    })

    const signedUrl = await getPackagingSignedDownloadUrl(path)

    await prisma.packagingComponent.update({
      where: { id: params.id },
      data: {
        supplierPdfPath: path,
        supplierPdfUrl: signedUrl,
        supplierPdfGeneratedAt: new Date(),
      },
    })

    await logPackagingActivity({
      packetId: component.packetId,
      userId: auth.profile.userId,
      action: 'supplier_pdf_generated',
      targetId: params.id,
    })

    const packet = await findAccessiblePacket(component.packetId)
    return NextResponse.json({ packet, supplierPdfUrl: signedUrl })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}
