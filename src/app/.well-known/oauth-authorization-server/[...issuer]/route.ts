import { NextRequest, NextResponse } from 'next/server'
import {
  buildAuthorizationServerMetadata,
  getOAuthEndpointBase,
  resolvePublicOrigin,
} from '@/lib/headless/mcp-oauth'

export const dynamic = 'force-dynamic'

/**
 * RFC 8414 §3.1 path insertion, kept for clients that recorded the earlier
 * `…/api/mcp/oauth` issuer. The returned `issuer` echoes the path that was
 * asked about, because a client compares the two and rejects a mismatch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issuer: string[] }> }
) {
  const { issuer } = await params
  const origin = resolvePublicOrigin(request.url)
  const requested = `${origin}/${(issuer ?? []).join('/')}`

  if (requested !== getOAuthEndpointBase(origin)) {
    return NextResponse.json(
      { error: 'not_found', error_description: 'Unknown authorization server.' },
      { status: 404 }
    )
  }

  return NextResponse.json(
    buildAuthorizationServerMetadata(origin, requested),
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  )
}
