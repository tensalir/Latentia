import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { requirePackagingWrite } from '@/lib/packaging/service'
import { componentPatchSchema, zodDetails } from '@/lib/packaging/schema'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string; componentId: string }
}

/**
 * Update the human-owned spec fields on one component page.
 *
 * The machine fields (inks / finishes / structural plates / print part number)
 * are absent from `componentPatchSchema` by design: they are read from the .ai
 * on upload and would be overwritten by the next sync anyway — "never
 * hand-fill" (loop-packaging-system SKILL.md).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = componentPatchSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const component = await prisma.packagingPacketComponent.findFirst({
    where: { id: params.componentId, packetId: params.id },
    select: { id: true },
  })
  if (!component) return packagingError('Component not found on this packet', { status: 404 })

  const updated = await prisma.packagingPacketComponent.update({
    where: { id: params.componentId },
    data: parsed.data,
    include: { componentType: true },
  })

  return NextResponse.json({
    component: {
      id: updated.id,
      displayName: updated.displayName,
      includeInCreativeIntent: updated.includeInCreativeIntent,
      pageOrder: updated.pageOrder,
      material: updated.material,
      printingMethod: updated.printingMethod,
      coatingMsdsRef: updated.coatingMsdsRef,
      paperThickness: updated.paperThickness,
      drawingPartNumber: updated.drawingPartNumber,
      approvalStatus: updated.approvalStatus,
      engineerNotes: updated.engineerNotes,
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
}
