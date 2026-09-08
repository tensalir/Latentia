import { NextRequest, NextResponse } from 'next/server'
import { OAuthError } from '@/lib/headless/mcp-oauth'
import {
  exchangeAuthorizationCode,
  findOAuthClient,
} from '@/lib/headless/mcp-oauth-store'

export const dynamic = 'force-dynamic'

/**
 * OAuth 2.1 token endpoint.
 *
 * Exchanges an authorization code for a `vsp_live_*` access token — the same
 * credential the /headless page issues by hand, so it carries the same tool
 * and model allowlists, rate limits, and audit trail, and can be revoked
 * from the same place.
 *
 * No refresh token is issued: the access token does not expire, and the
 * advertised metadata says so (`grant_types_supported` is authorization_code
 * only). Revoking is what ends access, from /headless or the revocation
 * endpoint.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

function fail(error: OAuthError): NextResponse {
  return NextResponse.json(error.toJSON(), {
    status: error.status,
    headers: NO_STORE,
  })
}

/** Accept form encoding (the spec) and JSON (what some clients send anyway). */
async function readParams(request: NextRequest): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') ?? ''
  const raw = await request.text()

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw || '{}') as Record<string, unknown>
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') params.set(key, value)
      }
      return params
    } catch {
      throw new OAuthError('invalid_request', 'Request body is not valid JSON.')
    }
  }

  return new URLSearchParams(raw)
}

export async function POST(request: NextRequest) {
  try {
    const params = await readParams(request)
    const grantType = params.get('grant_type')

    if (grantType !== 'authorization_code') {
      throw new OAuthError(
        'unsupported_grant_type',
        grantType === 'refresh_token'
          ? 'Vesper access tokens do not expire, so there is nothing to refresh. Reconnect the client to get a new one.'
          : 'Vesper supports the authorization_code grant only.'
      )
    }

    const code = params.get('code')
    const clientId = params.get('client_id')
    const redirectUri = params.get('redirect_uri')
    const codeVerifier = params.get('code_verifier')

    if (!code || !clientId || !redirectUri || !codeVerifier) {
      throw new OAuthError(
        'invalid_request',
        'code, client_id, redirect_uri, and code_verifier are all required.'
      )
    }

    // Public clients authenticate by proving possession of the PKCE
    // verifier, but the client must still exist.
    const client = await findOAuthClient(clientId)
    if (!client) {
      throw new OAuthError('invalid_client', 'Unknown client_id.', 401)
    }

    const result = await exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
    })

    return NextResponse.json(
      {
        access_token: result.accessToken,
        token_type: 'Bearer',
        scope: result.scope,
      },
      { headers: NO_STORE }
    )
  } catch (error) {
    if (error instanceof OAuthError) return fail(error)
    console.error('[mcp-oauth] token exchange failed', error)
    return fail(
      new OAuthError(
        'server_error',
        'Could not complete the token exchange.',
        500
      )
    )
  }
}
