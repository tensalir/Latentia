import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import {
  PackagingNotFoundError,
  requireAuthenticatedProfile,
  requirePackagingWrite,
} from '@/lib/packaging/service'
import { projectPatchSchema, zodDetails } from '@/lib/packaging/schema'
import { serializeProject } from '@/lib/packaging/serialize'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
}

/** Project detail — readable by any authenticated user, including people
 *  outside the packaging team who just need the file-location link. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const project = await prisma.packagingProject.findUnique({
    where: { id: params.id },
    include: {
      packets: {
        select: {
          id: true,
          stage: true,
          variant: true,
          skuCode: true,
          status: true,
          updatedAt: true,
          _count: { select: { components: true } },
        },
        orderBy: [{ stage: 'asc' }, { variant: 'asc' }],
      },
    },
  })
  if (!project) return packagingError('Project not found', { status: 404 })

  return NextResponse.json({
    project: {
      ...serializeProject(project),
      packets: project.packets.map((packet) => ({
        id: packet.id,
        stage: packet.stage,
        variant: packet.variant,
        skuCode: packet.skuCode,
        status: packet.status,
        componentCount: packet._count.components,
        updatedAt: packet.updatedAt.toISOString(),
      })),
    },
  })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = projectPatchSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  try {
    const existing = await prisma.packagingProject.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!existing) throw new PackagingNotFoundError('Project not found')

    // `slug` is intentionally immutable: it is baked into every storage path
    // already written for this project's packets.
    const project = await prisma.packagingProject.update({
      where: { id: params.id },
      data: parsed.data,
    })
    return NextResponse.json({ project: serializeProject(project) })
  } catch (err) {
    const translated = translateAccessError(err)
    if (translated) return translated
    throw err
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const project = await prisma.packagingProject.findUnique({
    where: { id: params.id },
    select: { id: true, ownerId: true, _count: { select: { packets: true } } },
  })
  if (!project) return packagingError('Project not found', { status: 404 })
  if (project.ownerId !== auth.profile.userId && !auth.profile.isAdmin) {
    return packagingError('Only the project owner or an admin can delete it.', { status: 403 })
  }
  if (project._count.packets > 0) {
    return packagingError(
      `This project still has ${project._count.packets} packet(s). Delete those first.`,
      { status: 409 }
    )
  }

  await prisma.packagingProject.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
