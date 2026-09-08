import { NextRequest, NextResponse } from 'next/server'
import {
  MCP_OAUTH_SCOPE,
  OAuthError,
  normalizeRedirectUris,
} from '@/lib/headless/mcp-oauth'
import { registerOAuthClient } from '@/lib/headless/mcp-oauth-store'

export const dynamic = 'force-dynamic'

/** Registration payloads are small; anything larger is not a real client. */
const MAX_BODY_BYTES = 16 * 1024

function optionalString(value: unknown, max = 512): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((v): v is string => typeof v === 'string').slice(0, 16)
  return out.length ? out : undefined
}

/**
 * RFC 7591 dynamic client registration.
 *
 * This is what Claude calls the moment you paste a Vesper MCP URL into "Add
 * custom connector"; if it does not answer with a registration document,
 * the connector fails before a user ever sees a login screen.
 *
 * Vesper registers public clients only. No `client_secret` is issued, and
 * `token_endpoint_auth_method` comes back as `none` whatever the client
 * asked for — PKCE (S256) is what protects the exchange, and the response
 * is authoritative per RFC 7591 §3.2.1.
 */
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Registration request is too large.'
      )
    }
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Registration body must be a JSON object.'
      )
    }
    payload = parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json(error.toJSON(), { status: error.status })
    }
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'Registration body must be valid JSON.',
      },
      { status: 400 }
    )
  }

  try {
    const redirectUris = normalizeRedirectUris(payload.redirect_uris)

    const client = await registerOAuthClient({
      clientName: optionalString(payload.client_name, 200),
      redirectUris,
      grantTypes: optionalStringArray(payload.grant_types),
      responseTypes: optionalStringArray(payload.response_types),
      scope: optionalString(payload.scope, 200) ?? MCP_OAUTH_SCOPE,
      clientUri: optionalString(payload.client_uri, 2048),
      logoUri: optionalString(payload.logo_uri, 2048),
      softwareId: optionalString(payload.software_id, 200),
      softwareVersion: optionalString(payload.software_version, 100),
    })

    // The response has to echo the registered metadata, `redirect_uris`
    // included: MCP clients validate this document against their client
    // schema and drop a registration that omits it.
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName ?? undefined,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: client.scope ?? MCP_OAUTH_SCOPE,
        client_uri: client.clientUri ?? undefined,
        logo_uri: client.logoUri ?? undefined,
        software_id: client.softwareId ?? undefined,
        software_version: client.softwareVersion ?? undefined,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json(error.toJSON(), { status: error.status })
    }
    // A failure that is not a validation error is ours, not the client's.
    // Saying `invalid_client_metadata` would send an integrator hunting
    // through a payload that was fine.
    console.error('[mcp-oauth] client registration failed', error)
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Could not register this client. Try again.',
      },
      { status: 500 }
    )
  }
}
