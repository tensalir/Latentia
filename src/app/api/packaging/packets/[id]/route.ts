import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  findAccessiblePacket,
  getPacketRole,
  logPackagingActivity,
  requireAuthenticatedProfile,
  requirePackagingWrite,
  requirePacketAccess,
} from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const packet = await findAccessiblePacket(params.id)
  if (!packet) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const role = await getPacketRole(params.id, auth.profile.userId)
  return NextResponse.json({ packet, role })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    await requirePacketAccess({
      packetId: params.id,
      userId: auth.profile.userId,
      minRole: 'editor',
    })
    const body = await request.json()
    const packet = await prisma.packagingPacket.update({
      where: { id: params.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.documentDraft != null ? { documentDraft: body.documentDraft } : {}),
        ...(body.status != null ? { status: body.status } : {}),
      },
      include: {
        project: true,
        components: { orderBy: { pageOrder: 'asc' }, include: { artworks: true } },
      },
    })
    if (body.documentDraft) {
      await logPackagingActivity({
        packetId: params.id,
        userId: auth.profile.userId,
        action: 'document_draft_saved',
      })
    }
    return NextResponse.json({ packet })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const packet = await prisma.packagingPacket.findUnique({
    where: { id: params.id },
    select: { ownerId: true },
  })
  if (!packet) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (packet.ownerId !== auth.profile.userId && !auth.profile.isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  await prisma.packagingPacket.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
