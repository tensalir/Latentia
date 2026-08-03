import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { requireAuthenticatedProfile, requirePackagingWrite } from '@/lib/packaging/service'
import { componentTypeCreateSchema, zodDetails } from '@/lib/packaging/schema'
import { serializeComponentType } from '@/lib/packaging/serialize'

export const dynamic = 'force-dynamic'

/** The components library — the master catalogue every project selects from. */
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
  const rows = await prisma.packagingComponentType.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    include: { _count: { select: { packetComponents: true } } },
  })

  return NextResponse.json({ componentTypes: rows.map(serializeComponentType) })
}

export async function POST(request: NextRequest) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = componentTypeCreateSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const existing = await prisma.packagingComponentType.findFirst({
    where: {
      OR: [{ slug: parsed.data.slug }, ...(parsed.data.code ? [{ code: parsed.data.code }] : [])],
    },
    select: { id: true, slug: true, code: true },
  })
  if (existing) {
    return packagingError(
      existing.slug === parsed.data.slug
        ? `A component named "${parsed.data.slug}" already exists in the library.`
        : `Component code "${parsed.data.code}" is already used.`,
      { status: 409 }
    )
  }

  const row = await prisma.packagingComponentType.create({
    data: {
      code: parsed.data.code ?? null,
      slug: parsed.data.slug,
      displayName: parsed.data.displayName,
      description: parsed.data.description ?? null,
      printed: parsed.data.printed,
      defaultInCreativeIntent: parsed.data.defaultInCreativeIntent,
      sortOrder: parsed.data.sortOrder,
      active: parsed.data.active,
    },
  })

  return NextResponse.json({ componentType: serializeComponentType(row) }, { status: 201 })
}
