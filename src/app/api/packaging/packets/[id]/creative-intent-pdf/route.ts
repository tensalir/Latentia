import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadPackagingBuffer, getPackagingSignedDownloadUrl } from '@/lib/packaging/signed-upload'
import { buildCreativeIntentPdf } from '@/lib/packaging/creative-intent-pdf'
import { creativeIntentPdfStoragePath, safeFileSlug } from '@/lib/packaging/storage'
import { evaluatePacketReadiness } from '@/lib/packaging/document'
import {
  requirePackagingWrite,
  requirePacketAccess,
  logPackagingActivity,
  findAccessiblePacket,
} from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    await requirePacketAccess({
      packetId: params.id,
      userId: auth.profile.userId,
      minRole: 'editor',
    })

    const packet = await findAccessiblePacket(params.id)
    if (!packet) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const readiness = evaluatePacketReadiness(packet)

    const projectInfo = (packet.projectInfo as Record<string, string>) || {}
    const components = packet.components
      .filter((c) => c.included)
      .map((c) => ({
        displayName: c.displayName,
        pageOrder: c.pageOrder,
        specs: (c.specs as Record<string, string>) || {},
        packingSteps: (c.packingSteps as Array<{ step?: string; instruction: string }>) || [],
      }))

    const pdfBytes = await buildCreativeIntentPdf({ project: projectInfo, components })
    const slug = safeFileSlug(packet.name)
    const path = creativeIntentPdfStoragePath(auth.profile.userId, packet.id, slug)
    await uploadPackagingBuffer({
      path,
      buffer: Buffer.from(pdfBytes),
      contentType: 'application/pdf',
    })
    const signedUrl = await getPackagingSignedDownloadUrl(path)

    await prisma.packagingPacket.update({
      where: { id: params.id },
      data: {
        creativeIntentPdfPath: path,
        creativeIntentPdfUrl: signedUrl,
        status: 'ready',
      },
    })

    await logPackagingActivity({
      packetId: params.id,
      userId: auth.profile.userId,
      action: 'creative_intent_pdf_generated',
    })

    const updated = await findAccessiblePacket(params.id)
    return NextResponse.json({ packet: updated, creativeIntentPdfUrl: signedUrl, readiness })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}
