import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import {
  logPackagingActivity,
  requireAuthenticatedProfile,
  requirePackagingWrite,
} from '@/lib/packaging/service'
import { packetCreateSchema, zodDetails } from '@/lib/packaging/schema'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const projectId = request.nextUrl.searchParams.get('projectId')
  const packets = await prisma.packagingPacket.findMany({
    where: projectId ? { projectId } : undefined,
    include: {
      project: { select: { id: true, name: true, slug: true } },
      _count: { select: { components: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    packets: packets.map((packet) => ({
      id: packet.id,
      projectId: packet.projectId,
      projectName: packet.project.name,
      stage: packet.stage,
      variant: packet.variant,
      skuCode: packet.skuCode,
      status: packet.status,
      componentCount: packet._count.components,
      updatedAt: packet.updatedAt.toISOString(),
    })),
  })
}

/** Create a stage × colourway packet — Anna's "one workbook per SKU". */
export async function POST(request: NextRequest) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = packetCreateSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const project = await prisma.packagingProject.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, name: true },
  })
  if (!project) return packagingError('Project not found', { status: 404 })

  const clash = await prisma.packagingPacket.findUnique({
    where: {
      projectId_stage_variant: {
        projectId: parsed.data.projectId,
        stage: parsed.data.stage,
        variant: parsed.data.variant,
      },
    },
    select: { id: true },
  })
  if (clash) {
    return packagingError(
      `${project.name} already has a ${parsed.data.stage} packet for "${parsed.data.variant}".`,
      { status: 409, extra: { packetId: clash.id } }
    )
  }

  const packet = await prisma.packagingPacket.create({
    data: {
      projectId: parsed.data.projectId,
      stage: parsed.data.stage,
      variant: parsed.data.variant,
      skuCode: parsed.data.skuCode ?? null,
      ownerId: auth.profile.userId,
    },
  })

  await logPackagingActivity({
    packetId: packet.id,
    userId: auth.profile.userId,
    action: 'created_packet',
    metadata: { stage: packet.stage, variant: packet.variant },
  })

  return NextResponse.json(
    {
      packet: {
        id: packet.id,
        projectId: packet.projectId,
        stage: packet.stage,
        variant: packet.variant,
        skuCode: packet.skuCode,
        status: packet.status,
        updatedAt: packet.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  )
}
