/**
 * Packaging Studio v2 service — auth, access, and shared queries.
 * Mirrors the CMF access model: reads open to any authenticated profile
 * (the packet library is a shared ground truth), writes gated by the
 * `packagingAccess` profile flag (admins implicitly allowed).
 *
 * Role-scoped field permissions are deliberately deferred ("at the
 * beginning, everything — each one knows what they need to fill").
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

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
  isAdmin: boolean
}

export function profileCanWritePackaging(profile: {
  role?: string | null
  packagingAccess?: boolean | null
} | null | undefined): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.packagingAccess === true
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
    },
  })

  if (!row || row.deletedAt) {
    return { profile: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (row.pausedAt) {
    return { profile: null, response: NextResponse.json({ error: 'Account paused' }, { status: 403 }) }
  }

  return {
    profile: {
      userId: data.user.id,
      email: data.user.email ?? null,
      canWrite: profileCanWritePackaging(row),
      isAdmin: row.role === 'admin',
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

// ── Shared query shapes ─────────────────────────────────────────────────────

export const COMPONENT_INCLUDE = {
  componentType: true,
  artworks: { orderBy: { createdAt: 'asc' as const } },
  packSteps: { orderBy: { stepNumber: 'asc' as const } },
} as const

export const PACKET_INCLUDE = {
  project: true,
  components: {
    orderBy: { pageOrder: 'asc' as const },
    include: COMPONENT_INCLUDE,
  },
  artworks: {
    where: { kind: 'overview' },
    orderBy: { createdAt: 'desc' as const },
  },
} as const

export async function getPacketOrThrow(packetId: string) {
  const packet = await prisma.packagingPacket.findUnique({
    where: { id: packetId },
    include: PACKET_INCLUDE,
  })
  if (!packet) throw new PackagingNotFoundError('Packet not found')
  return packet
}

export async function getComponentOrThrow(componentId: string) {
  const component = await prisma.packagingPacketComponent.findUnique({
    where: { id: componentId },
    include: { ...COMPONENT_INCLUDE, packet: { include: { project: true } } },
  })
  if (!component) throw new PackagingNotFoundError('Component not found')
  return component
}

export async function listProjects() {
  return prisma.packagingProject.findMany({
    include: {
      packets: {
        select: {
          id: true,
          stage: true,
          variant: true,
          status: true,
          updatedAt: true,
          _count: { select: { components: true } },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
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
