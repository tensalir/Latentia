import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * OAuth authorize — redirects to Vesper headless self-service credential UI.
 * After login, users mint a vsp_live token on /headless and paste it into
 * their MCP client. Full Supabase-backed auth code exchange can extend this
 * endpoint later.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const redirectUri = url.searchParams.get('redirect_uri')
  const state = url.searchParams.get('state')
  const headless = new URL('/headless', url.origin)
  headless.searchParams.set('oauth', '1')
  if (redirectUri) headless.searchParams.set('redirect_uri', redirectUri)
  if (state) headless.searchParams.set('state', state)
  return NextResponse.redirect(headless.toString())
}
