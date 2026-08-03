import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import {
  getPacketOrThrow,
  requireAuthenticatedProfile,
  requirePackagingWrite,
} from '@/lib/packaging/service'
import { packetPatchSchema, zodDetails } from '@/lib/packaging/schema'
import { serializePacket } from '@/lib/packaging/serialize'
import { summarisePacketReadiness } from '@/lib/packaging/generation'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
}

/** The full packet graph: project info, components with specs, artwork, steps. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  try {
    const packet = await getPacketOrThrow(params.id)
    return NextResponse.json({
      packet: await serializePacket(packet),
      readiness: summarisePacketReadiness(packet),
      canWrite: auth.profile.canWrite,
    })
  } catch (err) {
    const translated = translateAccessError(err)
    if (translated) return translated
    throw err
  }
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

  const parsed = packetPatchSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const existing = await prisma.packagingPacket.findUnique({
    where: { id: params.id },
    select: { id: true },
  })
  if (!existing) return packagingError('Packet not found', { status: 404 })

  const { artworkDate, ...rest } = parsed.data
  await prisma.packagingPacket.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(artworkDate === undefined
        ? {}
        : { artworkDate: artworkDate ? new Date(`${artworkDate}T00:00:00.000Z`) : null }),
    },
  })

  const packet = await getPacketOrThrow(params.id)
  return NextResponse.json({ packet: await serializePacket(packet) })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const packet = await prisma.packagingPacket.findUnique({
    where: { id: params.id },
    select: { id: true, ownerId: true },
  })
  if (!packet) return packagingError('Packet not found', { status: 404 })
  if (packet.ownerId !== auth.profile.userId && !auth.profile.isAdmin) {
    return packagingError('Only the packet owner or an admin can delete it.', { status: 403 })
  }

  await prisma.packagingPacket.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
