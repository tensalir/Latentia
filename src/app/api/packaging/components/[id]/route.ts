import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePackagingWrite, requirePacketAccess, logPackagingActivity } from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    const component = await prisma.packagingComponent.findUnique({
      where: { id: params.id },
      select: { packetId: true },
    })
    if (!component) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    await requirePacketAccess({
      packetId: component.packetId,
      userId: auth.profile.userId,
      minRole: 'editor',
    })

    const body = await request.json()
    const updated = await prisma.packagingComponent.update({
      where: { id: params.id },
      data: {
        ...(body.specs != null ? { specs: body.specs } : {}),
        ...(body.included != null ? { included: body.included } : {}),
      },
      include: { artworks: true },
    })

    await logPackagingActivity({
      packetId: component.packetId,
      userId: auth.profile.userId,
      action: 'edited_component',
      targetId: params.id,
    })

    return NextResponse.json({ component: updated })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}
