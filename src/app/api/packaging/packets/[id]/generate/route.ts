import { NextRequest, NextResponse } from 'next/server'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import { logPackagingActivity, requirePackagingWrite } from '@/lib/packaging/service'
import { generatePacketOutputs } from '@/lib/packaging/generation'
import { getPacketOrThrow } from '@/lib/packaging/service'
import { serializePacket } from '@/lib/packaging/serialize'

export const dynamic = 'force-dynamic'
// Stamping every page of several large .ai files plus composing the Creative
// Intent is the heaviest thing this app does.
export const maxDuration = 300

interface Params {
  params: { id: string }
}

/** "Create supplier packets" — generates every supplier PDF plus the Creative
 *  Intent. Per-component failures are reported, not thrown: the run continues
 *  and the response says exactly what came out. */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    const result = await generatePacketOutputs({
      packetId: params.id,
      userId: auth.profile.userId,
    })

    await logPackagingActivity({
      packetId: params.id,
      userId: auth.profile.userId,
      action: 'generated_outputs',
      metadata: {
        generated: result.supplierPdfs.filter((r) => r.status === 'generated').length,
        skipped: result.supplierPdfs.filter((r) => r.status === 'skipped').length,
        failed: result.supplierPdfs.filter((r) => r.status === 'failed').length,
        creativeIntent: result.creativeIntent.status,
      },
    })

    const packet = await getPacketOrThrow(params.id)
    return NextResponse.json({
      supplierPdfs: result.supplierPdfs,
      creativeIntent: result.creativeIntent,
      readiness: result.readiness,
      packet: await serializePacket(packet),
    })
  } catch (err) {
    const translated = translateAccessError(err)
    if (translated) return translated
    return packagingError(err instanceof Error ? err.message : 'Generation failed', { status: 500 })
  }
}
