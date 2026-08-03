import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import {
  getPacketOrThrow,
  logPackagingActivity,
  requirePackagingWrite,
} from '@/lib/packaging/service'
import { regenerateComponentSupplierPdf } from '@/lib/packaging/generation'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface Params {
  params: { id: string; componentId: string }
}

/**
 * Re-stamp one component's supplier brief without re-running the whole packet —
 * the usual case after a single artwork or spec correction.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const component = await prisma.packagingPacketComponent.findFirst({
    where: { id: params.componentId, packetId: params.id },
    select: { id: true },
  })
  if (!component) return packagingError('Component not found on this packet', { status: 404 })

  try {
    const packet = await getPacketOrThrow(params.id)
    const outcome = await regenerateComponentSupplierPdf({
      packet,
      componentId: params.componentId,
    })

    await logPackagingActivity({
      packetId: params.id,
      userId: auth.profile.userId,
      action: 'regenerated_supplier_pdf',
      targetId: params.componentId,
      metadata: { status: outcome.status, reason: outcome.reason },
    })

    return NextResponse.json({ outcome })
  } catch (err) {
    const translated = translateAccessError(err)
    if (translated) return translated
    return packagingError(err instanceof Error ? err.message : 'Could not build the supplier PDF', {
      status: 500,
    })
  }
}
