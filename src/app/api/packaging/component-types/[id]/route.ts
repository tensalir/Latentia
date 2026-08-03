import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { requirePackagingWrite } from '@/lib/packaging/service'
import { componentTypePatchSchema, zodDetails } from '@/lib/packaging/schema'
import { serializeComponentType } from '@/lib/packaging/serialize'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
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

  const parsed = componentTypePatchSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const existing = await prisma.packagingComponentType.findUnique({
    where: { id: params.id },
    select: { id: true, slug: true, _count: { select: { packetComponents: true } } },
  })
  if (!existing) return packagingError('Component type not found', { status: 404 })

  // The slug is the key artwork filenames are matched on, and it names the
  // storage folders already written for every packet using this component —
  // so it is frozen once the component is in use.
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    if (existing._count.packetComponents > 0) {
      return packagingError(
        `"${existing.slug}" is used by ${existing._count.packetComponents} packet component(s), so its tab name can't change. Create a new library entry instead.`,
        { status: 409 }
      )
    }
    const clash = await prisma.packagingComponentType.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true },
    })
    if (clash) {
      return packagingError(`Another component already uses "${parsed.data.slug}".`, { status: 409 })
    }
  }

  if (parsed.data.code) {
    const codeClash = await prisma.packagingComponentType.findFirst({
      where: { code: parsed.data.code, id: { not: params.id } },
      select: { id: true },
    })
    if (codeClash) {
      return packagingError(`Component code "${parsed.data.code}" is already used.`, { status: 409 })
    }
  }

  const row = await prisma.packagingComponentType.update({
    where: { id: params.id },
    data: parsed.data,
  })
  return NextResponse.json({ componentType: serializeComponentType(row) })
}

/**
 * Soft-delete: a component type that is in use is deactivated (hidden from the
 * picker) rather than removed, because packets reference it. Only an unused
 * entry is deleted outright.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  const existing = await prisma.packagingComponentType.findUnique({
    where: { id: params.id },
    select: { id: true, slug: true, _count: { select: { packetComponents: true } } },
  })
  if (!existing) return packagingError('Component type not found', { status: 404 })

  if (existing._count.packetComponents > 0) {
    const row = await prisma.packagingComponentType.update({
      where: { id: params.id },
      data: { active: false },
    })
    return NextResponse.json({
      componentType: serializeComponentType(row),
      deactivated: true,
      message: `"${existing.slug}" is in use, so it was hidden from the picker instead of deleted.`,
    })
  }

  await prisma.packagingComponentType.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
