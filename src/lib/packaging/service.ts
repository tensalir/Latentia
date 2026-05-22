/**
 * Packaging Studio service — mirrors CMF access model.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import type { NormalizedPackagingWorkbook, PackagingComponentInput } from './schema'
import { slugFromProductName } from './components'

export class PackagingNotFoundError extends Error {
  constructor(message = 'Packaging resource not found') {
    super(message)
    this.name = 'PackagingNotFoundError'
  }
}

export class PackagingForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'PackagingForbiddenError'
  }
}

export interface AuthenticatedPackagingProfile {
  userId: string
  email: string | null
  canWrite: boolean
  canManageMaterials: boolean
  isAdmin: boolean
}

export type PackagingPacketRole = 'owner' | 'editor' | 'viewer'

const ROLE_RANK: Record<PackagingPacketRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
}

export function roleAllows(actual: PackagingPacketRole, required: PackagingPacketRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required]
}

export function profileCanWritePackaging(profile: {
  role?: string | null
  packagingAccess?: boolean | null
} | null | undefined): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.packagingAccess === true
}

export function profileCanManageMaterials(profile: {
  role?: string | null
  packagingEngineerRole?: boolean | null
} | null | undefined): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.packagingEngineerRole === true
}

export async function requireAuthenticatedProfile(): Promise<
  | { profile: AuthenticatedPackagingProfile; response: null }
  | { profile: null; response: NextResponse }
> {
  const supabase = createRouteHandlerClient({ cookies })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return { profile: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const row = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: {
      deletedAt: true,
      pausedAt: true,
      role: true,
      packagingAccess: true,
      packagingEngineerRole: true,
    },
  })

  if (!row || row.deletedAt) {
    return { profile: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (row.pausedAt) {
    return { profile: null, response: NextResponse.json({ error: 'Account paused' }, { status: 403 }) }
  }

  const isAdmin = row.role === 'admin'
  return {
    profile: {
      userId: data.user.id,
      email: data.user.email ?? null,
      canWrite: profileCanWritePackaging(row),
      canManageMaterials: profileCanManageMaterials(row),
      isAdmin,
    },
    response: null,
  }
}

export async function requirePackagingWrite(): Promise<
  | { profile: AuthenticatedPackagingProfile; response: null }
  | { profile: null; response: NextResponse }
> {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth
  if (!auth.profile.canWrite) {
    return {
      profile: null,
      response: NextResponse.json(
        {
          error: 'packaging_access_required',
          message:
            'Packaging write access is required. Ask an admin to grant Packaging access from user management.',
        },
        { status: 403 }
      ),
    }
  }
  return { profile: auth.profile, response: null }
}

export async function requireMaterialsWrite(): Promise<
  | { profile: AuthenticatedPackagingProfile; response: null }
  | { profile: null; response: NextResponse }
> {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth
  if (!auth.profile.canManageMaterials) {
    return {
      profile: null,
      response: NextResponse.json(
        { error: 'packaging_engineer_required', message: 'Packaging engineer role required.' },
        { status: 403 }
      ),
    }
  }
  return { profile: auth.profile, response: null }
}

export async function getPacketRole(packetId: string, userId: string): Promise<PackagingPacketRole | null> {
  const packet = await prisma.packagingPacket.findUnique({
    where: { id: packetId },
    select: { ownerId: true },
  })
  if (!packet) return null
  if (packet.ownerId === userId) return 'owner'
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true, packagingAccess: true },
  })
  return profileCanWritePackaging(profile) ? 'editor' : 'viewer'
}

export async function requirePacketAccess(args: {
  packetId: string
  userId: string
  minRole?: PackagingPacketRole
}) {
  const role = await getPacketRole(args.packetId, args.userId)
  if (!role) throw new PackagingNotFoundError('Packet not found')
  if (args.minRole && !roleAllows(role, args.minRole)) {
    throw new PackagingForbiddenError(`Requires ${args.minRole}`)
  }
  return { role }
}

export const PACKET_INCLUDE = {
  project: true,
  components: {
    orderBy: { pageOrder: 'asc' as const },
    include: { artworks: true },
  },
  import: true,
} as const

export async function findAccessiblePacket(packetId: string) {
  return prisma.packagingPacket.findUnique({
    where: { id: packetId },
    include: PACKET_INCLUDE,
  })
}

export async function listAccessiblePackets() {
  return prisma.packagingPacket.findMany({
    include: {
      project: true,
      components: { select: { id: true, slug: true, included: true } },
      owner: { select: { id: true, displayName: true, username: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function listProjects() {
  return prisma.packagingProject.findMany({
    include: {
      packets: {
        select: { id: true, name: true, stage: true, variant: true, status: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
    orderBy: { displayName: 'asc' },
  })
}

export async function logPackagingActivity(args: {
  packetId: string
  userId: string
  action: string
  targetId?: string
  metadata?: Record<string, unknown>
}) {
  await prisma.packagingActivity.create({
    data: {
      packetId: args.packetId,
      userId: args.userId,
      action: args.action,
      targetId: args.targetId,
      metadata: (args.metadata ?? undefined) as object | undefined,
    },
  })
}

export async function createPacketFromWorkbook(args: {
  ownerId: string
  importId?: string | null
  normalized: NormalizedPackagingWorkbook
  packetName?: string
}): Promise<{ packet: Awaited<ReturnType<typeof findAccessiblePacket>>; project: { id: string } }> {
  const info = args.normalized.projectInfo
  const displayName = info.projectName || 'Packaging Project'
  const productSlug = slugFromProductName(displayName)
  const stage = (info.stage || 'MP').toUpperCase()
  const variant = info.skuColourway || null

  let project = await prisma.packagingProject.findUnique({ where: { productSlug } })
  if (!project) {
    project = await prisma.packagingProject.create({
      data: {
        productSlug,
        displayName,
        productType: info.productType,
        productFamily: info.productFamily,
        ownerId: args.ownerId,
      },
    })
  }

  const packetName =
    args.packetName ||
    `${displayName.split(' ')[0] || 'Pack'}_${stage}${variant ? `_${variant}` : ''}`

  const packet = await prisma.packagingPacket.create({
    data: {
      projectId: project.id,
      importId: args.importId ?? null,
      ownerId: args.ownerId,
      name: packetName,
      stage,
      variant,
      status: 'review',
      projectInfo: info as object,
      artworkFolder: info.artworkFolder ?? null,
      overviewImageName: info.overviewImageName ?? null,
      components: {
        create: args.normalized.components
          .filter((c) => c.included)
          .map((c) => componentToDb(c)),
      },
    },
    include: PACKET_INCLUDE,
  })

  await logPackagingActivity({
    packetId: packet.id,
    userId: args.ownerId,
    action: 'created_packet',
    metadata: { packetName, stage, variant },
  })

  return { packet, project: { id: project.id } }
}

function componentToDb(c: PackagingComponentInput) {
  return {
    slug: c.slug,
    displayName: c.displayName,
    style: c.style,
    pageOrder: c.pageOrder,
    included: c.included,
    specs: c.specs as object,
    packingSteps: c.packingSteps as object,
    dimensions: c.dimensions as object,
  }
}

export async function updateComponentSpecs(
  componentId: string,
  specs: Record<string, string>
) {
  return prisma.packagingComponent.update({
    where: { id: componentId },
    data: { specs: specs as object },
  })
}
