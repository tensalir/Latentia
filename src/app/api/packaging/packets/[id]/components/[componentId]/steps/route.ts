import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { requirePackagingWrite } from '@/lib/packaging/service'
import { stepsPutSchema, zodDetails } from '@/lib/packaging/schema'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string; componentId: string }
}

/**
 * Replace-all for a component's pack instructions ("Step 1, Step 2, Step 3…" —
 * the reason a non-printed part like tissue paper still earns a page in the
 * Creative Intent). Sent whole so reordering and deletion need no extra verbs;
 * step numbers are assigned from array position.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = stepsPutSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const component = await prisma.packagingPacketComponent.findFirst({
    where: { id: params.componentId, packetId: params.id },
    select: { id: true },
  })
  if (!component) return packagingError('Component not found on this packet', { status: 404 })

  const steps = await prisma.$transaction(async (tx) => {
    await tx.packagingPackInstructionStep.deleteMany({
      where: { packetComponentId: component.id },
    })
    if (parsed.data.steps.length === 0) return []
    await tx.packagingPackInstructionStep.createMany({
      data: parsed.data.steps.map((step, index) => ({
        packetComponentId: component.id,
        stepNumber: index + 1,
        instruction: step.instruction,
        imagePath: step.imagePath ?? null,
        imageFileName: step.imageFileName ?? null,
      })),
    })
    return tx.packagingPackInstructionStep.findMany({
      where: { packetComponentId: component.id },
      orderBy: { stepNumber: 'asc' },
    })
  })

  return NextResponse.json({
    steps: steps.map((step) => ({
      id: step.id,
      stepNumber: step.stepNumber,
      instruction: step.instruction,
      imagePath: step.imagePath,
      imageFileName: step.imageFileName,
    })),
  })
}
