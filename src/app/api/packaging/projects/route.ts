import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { listProjects, requireAuthenticatedProfile, requirePackagingWrite } from '@/lib/packaging/service'
import { projectCreateSchema, zodDetails } from '@/lib/packaging/schema'
import { serializeProject } from '@/lib/packaging/serialize'
import { slugifyProjectName } from '@/lib/packaging/catalogue'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const projects = await listProjects()
  return NextResponse.json({
    projects: projects.map((project) => ({
      ...serializeProject(project),
      packets: project.packets.map((packet) => ({
        id: packet.id,
        stage: packet.stage,
        variant: packet.variant,
        status: packet.status,
        componentCount: packet._count.components,
        updatedAt: packet.updatedAt.toISOString(),
      })),
    })),
  })
}

export async function POST(request: NextRequest) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = projectCreateSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const slug = slugifyProjectName(parsed.data.name)
  if (!slug) return packagingError('Project name must contain at least one letter or digit.')

  const clash = await prisma.packagingProject.findUnique({ where: { slug }, select: { id: true } })
  if (clash) {
    return packagingError(`A project named "${parsed.data.name}" already exists.`, { status: 409 })
  }

  const project = await prisma.packagingProject.create({
    data: {
      name: parsed.data.name,
      slug,
      productType: parsed.data.productType ?? null,
      productFamily: parsed.data.productFamily ?? null,
      supplier: parsed.data.supplier ?? null,
      internalRef: parsed.data.internalRef ?? null,
      fileLocationUrl: parsed.data.fileLocationUrl ?? null,
      packagingDesignerName: parsed.data.packagingDesignerName ?? null,
      packagingDesignerId: parsed.data.packagingDesignerId ?? null,
      graphicDesignerName: parsed.data.graphicDesignerName ?? null,
      graphicDesignerId: parsed.data.graphicDesignerId ?? null,
      packagingEngineerName: parsed.data.packagingEngineerName ?? null,
      packagingEngineerId: parsed.data.packagingEngineerId ?? null,
      notes: parsed.data.notes ?? null,
      ownerId: auth.profile.userId,
    },
  })

  return NextResponse.json({ project: serializeProject(project) }, { status: 201 })
}
