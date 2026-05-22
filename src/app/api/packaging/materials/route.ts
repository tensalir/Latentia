import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthenticatedProfile, requireMaterialsWrite } from '@/lib/packaging/service'
import { packagingError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const kind = request.nextUrl.searchParams.get('kind')
  const materials = await prisma.packagingMaterial.findMany({
    where: {
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ materials })
}

export async function POST(request: NextRequest) {
  const auth = await requireMaterialsWrite()
  if (!auth.profile) return auth.response

  try {
    const body = await request.json()
    const material = await prisma.packagingMaterial.create({
      data: {
        kind: body.kind,
        code: body.code,
        name: body.name,
        description: body.description,
        attributes: body.attributes ?? {},
        approvalStatus: body.approvalStatus ?? 'approved',
        approvedBy: auth.profile.userId,
        approvedAt: new Date(),
        notes: body.notes,
        createdBy: auth.profile.userId,
        updatedBy: auth.profile.userId,
      },
    })
    return NextResponse.json({ material })
  } catch (err) {
    return packagingError(err)
  }
}
