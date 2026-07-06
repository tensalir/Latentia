import { NextRequest, NextResponse } from 'next/server'
import { buildAuthorizationServerMetadata } from '@/lib/headless/mcp-oauth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  return NextResponse.json(buildAuthorizationServerMetadata(origin), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
