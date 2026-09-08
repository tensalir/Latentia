import { NextRequest, NextResponse } from 'next/server'
import {
  buildAuthorizationServerMetadata,
  getOAuthEndpointBase,
  resolvePublicOrigin,
} from '@/lib/headless/mcp-oauth'

export const dynamic = 'force-dynamic'

/**
 * Path-appended alias. Not a location any spec sends a client to, but it is
 * where Vesper served this document first, so anything that recorded it
 * keeps working. Issuer echoes the pathful form for the same reason.
 */
export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request.url)
  return NextResponse.json(
    buildAuthorizationServerMetadata(origin, getOAuthEndpointBase(origin)),
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  )
}
