import { NextRequest, NextResponse } from 'next/server'
import {
  buildProtectedResourceMetadata,
  getMcpResourceUrl,
  resolvePublicOrigin,
} from '@/lib/headless/mcp-oauth'

export const dynamic = 'force-dynamic'

/**
 * RFC 9728 §3.1 path insertion. A client that was pointed at
 * `https://vesper.example/api/mcp` looks for its metadata at
 * `/.well-known/oauth-protected-resource/api/mcp`, not at the bare
 * well-known path, so serve it there too.
 *
 * Only the real MCP resource answers. Anything else 404s rather than
 * claiming to describe a resource that does not exist.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string[] }> }
) {
  const { resource } = await params
  const origin = resolvePublicOrigin(request.url)
  const requested = `${origin}/${(resource ?? []).join('/')}`

  if (requested !== getMcpResourceUrl(origin)) {
    return NextResponse.json(
      { error: 'not_found', error_description: 'Unknown protected resource.' },
      { status: 404 }
    )
  }

  return NextResponse.json(buildProtectedResourceMetadata(origin, requested), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
