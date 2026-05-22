import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthenticatedProfile, requirePackagingWrite, requirePacketAccess } from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const comments = await prisma.packagingComment.findMany({
    where: { packetId: params.id },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
    },
  })
  return NextResponse.json({ comments })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    await requirePacketAccess({
      packetId: params.id,
      userId: auth.profile.userId,
      minRole: 'editor',
    })
    const body = await request.json()
    const comment = await prisma.packagingComment.create({
      data: {
        packetId: params.id,
        componentId: body.componentId ?? null,
        userId: auth.profile.userId,
        body: body.body,
      },
      include: {
        user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      },
    })
    return NextResponse.json({ comment })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}
