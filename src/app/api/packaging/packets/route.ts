import { NextResponse } from 'next/server'
import { listAccessiblePackets, requireAuthenticatedProfile } from '@/lib/packaging/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response
  const packets = await listAccessiblePackets()
  return NextResponse.json({
    packets,
    role: auth.profile.canWrite ? 'editor' : 'viewer',
  })
}
