import { NextRequest, NextResponse } from 'next/server'
import {
  buildAuthorizationServerMetadata,
  resolvePublicOrigin,
} from '@/lib/headless/mcp-oauth'

export const dynamic = 'force-dynamic'

/**
 * RFC 8414 authorization server metadata, at the location derived from a
 * root issuer. This is the first URL every MCP client tries.
 */
export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request.url)
  return NextResponse.json(buildAuthorizationServerMetadata(origin), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
