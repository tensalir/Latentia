import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import {
  getPacketOrThrow,
  logPackagingActivity,
  requirePackagingWrite,
} from '@/lib/packaging/service'
import { componentsSyncSchema, zodDetails } from '@/lib/packaging/schema'
import { serializePacket } from '@/lib/packaging/serialize'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
}

/**
 * Sync the components-library selection for this packet: create rows for newly
 * ticked catalogue entries, delete rows for unticked ones.
 *
 * A component that already carries artwork or filled specs is NOT silently
 * dropped — the response lists what would be lost and asks for `force`, so a
 * mis-click in the library dialog can't destroy an engineer's work.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = componentsSyncSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  try {
    const packet = await getPacketOrThrow(params.id)
    const requested = new Set(parsed.data.componentTypeIds)
    const current = new Map(packet.components.map((c) => [c.componentTypeId, c]))

    const toAdd = parsed.data.componentTypeIds.filter((id) => !current.has(id))
    const toRemove = packet.components.filter((c) => !requested.has(c.componentTypeId))

    if (toAdd.length > 0) {
      const types = await prisma.packagingComponentType.findMany({
        where: { id: { in: toAdd } },
      })
      if (types.length !== toAdd.length) {
        return packagingError('One or more selected components no longer exist in the library.', {
          status: 404,
        })
      }
    }

    if (!parsed.data.force) {
      const wouldLose = toRemove
        .filter(
          (c) =>
            c.artworks.length > 0 ||
            c.packSteps.length > 0 ||
            c.material ||
            c.printingMethod ||
            c.coatingMsdsRef ||
            c.engineerNotes
        )
        .map((c) => ({ id: c.id, displayName: c.displayName, artworkCount: c.artworks.length }))
      if (wouldLose.length > 0) {
        return packagingError(
          'Deselecting these components would delete artwork or filled specs.',
          { status: 409, extra: { wouldLose } }
        )
      }
    }

    const maxOrder = packet.components.reduce((max, c) => Math.max(max, c.pageOrder), 0)

    await prisma.$transaction(async (tx) => {
      if (toRemove.length > 0) {
        await tx.packagingPacketComponent.deleteMany({
          where: { id: { in: toRemove.map((c) => c.id) } },
        })
      }
      if (toAdd.length > 0) {
        const types = await tx.packagingComponentType.findMany({ where: { id: { in: toAdd } } })
        // Preserve the order the caller sent so library ticking order is kept.
        const ordered = toAdd
          .map((id) => types.find((t) => t.id === id))
          .filter((t): t is (typeof types)[number] => Boolean(t))
        await tx.packagingPacketComponent.createMany({
          data: ordered.map((type, i) => ({
            packetId: packet.id,
            componentTypeId: type.id,
            displayName: type.displayName,
            includeInCreativeIntent: type.defaultInCreativeIntent,
            pageOrder: maxOrder + i + 1,
          })),
        })
      }
    })

    if (toAdd.length > 0 || toRemove.length > 0) {
      await logPackagingActivity({
        packetId: packet.id,
        userId: auth.profile.userId,
        action: 'synced_components',
        metadata: { added: toAdd.length, removed: toRemove.length },
      })
    }

    const updated = await getPacketOrThrow(params.id)
    return NextResponse.json({
      packet: await serializePacket(updated),
      added: toAdd.length,
      removed: toRemove.length,
    })
  } catch (err) {
    const translated = translateAccessError(err)
    if (translated) return translated
    throw err
  }
}
