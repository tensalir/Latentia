import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMaterialsWrite } from '@/lib/packaging/service'
import { packagingError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireMaterialsWrite()
  if (!auth.profile) return auth.response

  try {
    const body = await request.json()
    const material = await prisma.packagingMaterial.update({
      where: { id: params.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.description != null ? { description: body.description } : {}),
        ...(body.attributes != null ? { attributes: body.attributes } : {}),
        ...(body.approvalStatus != null ? { approvalStatus: body.approvalStatus } : {}),
        ...(body.notes != null ? { notes: body.notes } : {}),
        updatedBy: auth.profile.userId,
      },
    })
    return NextResponse.json({ material })
  } catch (err) {
    return packagingError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireMaterialsWrite()
  if (!auth.profile) return auth.response
  await prisma.packagingMaterial.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
