import { NextRequest, NextResponse } from 'next/server'
import { revokeOAuthAccessToken } from '@/lib/headless/mcp-oauth-store'

export const dynamic = 'force-dynamic'

/**
 * RFC 7009 token revocation — what a client calls when a user disconnects.
 *
 * Only credentials this OAuth flow issued can be revoked here, so a stray or
 * hostile call can never take down an admin-issued partner token. Per the
 * RFC the response is 200 either way; telling a caller whether a token
 * existed would make this an oracle.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  const raw = await request.text()

  let token: string | null = null
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw || '{}') as { token?: unknown }
      if (typeof parsed.token === 'string') token = parsed.token
    } catch {
      token = null
    }
  } else {
    token = new URLSearchParams(raw).get('token')
  }

  if (token) {
    try {
      await revokeOAuthAccessToken(token)
    } catch (error) {
      console.error('[mcp-oauth] revocation failed', error)
    }
  }

  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
