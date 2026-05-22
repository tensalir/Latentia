import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthenticatedProfile } from '@/lib/packaging/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100)
  const activities = await prisma.packagingActivity.findMany({
    where: { packetId: params.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
    },
  })
  return NextResponse.json({ activities })
}
