import { NextResponse } from 'next/server'
import { listProjects, requireAuthenticatedProfile } from '@/lib/packaging/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response
  const projects = await listProjects()
  return NextResponse.json({ projects, role: auth.profile.canWrite ? 'editor' : 'viewer' })
}
