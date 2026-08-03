import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { requireAuthenticatedProfile } from '@/lib/packaging/service'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
}

/**
 * Who did what on this packet. The handover is collaborative — three roles fill
 * different fields on the same component — so "when did the artwork change and
 * who re-generated after it" is a question the team actually asks.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const packet = await prisma.packagingPacket.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!packet) return packagingError('Packet not found', { status: 404 })

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)
  const take = Number.isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 200)

  const rows = await prisma.packagingActivity.findMany({
    where: { packetId: params.id },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
    },
  })

  return NextResponse.json({
    activity: rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetId: row.targetId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      user: {
        id: row.user.id,
        name: row.user.displayName ?? row.user.username ?? 'Someone',
        avatarUrl: row.user.avatarUrl,
      },
    })),
  })
}
