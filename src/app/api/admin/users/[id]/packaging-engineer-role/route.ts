import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin()
    if (result.response) return result.response

    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Expected `{ enabled: boolean }`' }, { status: 400 })
    }

    const profile = await prisma.profile.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    })
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (profile.deletedAt) {
      return NextResponse.json({ error: 'Cannot grant role to deleted user' }, { status: 400 })
    }

    const updated = await prisma.profile.update({
      where: { id },
      data: { packagingEngineerRole: body.enabled },
      select: { id: true, packagingEngineerRole: true },
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update engineer role'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
