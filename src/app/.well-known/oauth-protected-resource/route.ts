import { NextRequest, NextResponse } from 'next/server'
import { buildProtectedResourceMetadata } from '@/lib/headless/mcp-oauth'

export const dynamic = 'force-dynamic'

/** RFC 9728 — MCP clients discover OAuth requirements here. */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  return NextResponse.json(buildProtectedResourceMetadata(origin), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
