import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { translateAccessError } from '@/lib/packaging/api'
import { getPacketOrThrow, requireAuthenticatedProfile } from '@/lib/packaging/service'
import { buildPackagingWorkbook, workbookFileName } from '@/lib/packaging/workbook-export'
import { buildExportInput } from '@/lib/packaging/workbook-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Params {
  params: { id: string }
}

/** Download the packet as a Creative Intent workbook (half of the round trip). */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  try {
    const packet = await getPacketOrThrow(params.id)
    const input = await buildExportInput(packet)
    const buffer = buildPackagingWorkbook(input)
    const fileName = workbookFileName({
      projectName: packet.project.name,
      stage: packet.stage,
      variant: packet.variant,
    })

    // Stamped so the UI can show when the sheet the team is editing was taken.
    await prisma.packagingPacket.update({
      where: { id: packet.id },
      data: { lastExportedAt: new Date() },
    })

    // `Buffer` isn't a valid BodyInit for the fetch types Next ships; hand it a
    // plain Uint8Array view over the same bytes.
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const translated = translateAccessError(err)
    if (translated) return translated
    throw err
  }
}
