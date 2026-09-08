/**
 * MCP OAuth 2.1 metadata and validation helpers for Vesper headless.
 *
 * Two things live here and nothing else: the discovery documents an MCP
 * client reads before it can log a user in, and the pure validation rules
 * (redirect URIs, PKCE) that the authorize/token routes apply. Everything
 * that touches the database sits in `mcp-oauth-store.ts` so this module
 * stays importable from edge-ish contexts and from tests.
 *
 * Discovery layout, and why it looks like this:
 *
 *   issuer                  https://vesper.example
 *   AS metadata             /.well-known/oauth-authorization-server
 *   PR metadata             /.well-known/oauth-protected-resource/api/mcp
 *   authorize/token/...     /api/mcp/oauth/*
 *
 * RFC 8414 derives the metadata *location* from the issuer, not from where
 * the endpoints live. An earlier revision used `…/api/mcp/oauth` as the
 * issuer and served metadata at `/api/mcp/oauth/.well-known/…`, which no
 * spec-following client ever requests: for a pathful issuer they probe
 * `/.well-known/oauth-authorization-server/api/mcp/oauth` instead. Using a
 * root issuer puts the document exactly where every client looks first.
 * The pathful aliases are still served for anything that cached the old
 * shape — see the `[...]` routes under `app/.well-known`.
 *
 * Bearer tokens (`vsp_live_*`) minted on /headless remain fully supported;
 * OAuth issues the same kind of credential through a browser login instead
 * of a URL that has to be emailed around.
 */

import crypto from 'crypto'

/** The only scope Vesper issues. Access is scoped per credential, not per scope string. */
export const MCP_OAUTH_SCOPE = 'mcp:tools'

/** Authorization codes are single-use and short-lived (OAuth 2.1 caps this at 10 minutes). */
export const AUTH_CODE_TTL_SECONDS = 300

/** A consent request that is never approved expires on its own. */
export const AUTH_REQUEST_TTL_SECONDS = 600

/** Registered clients may not point at an unbounded list of callbacks. */
export const MAX_REDIRECT_URIS = 8

/** Schemes that must never appear in a redirect URI, registered or not. */
const FORBIDDEN_REDIRECT_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
])

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function trimOrigin(origin: string): string {
  return origin.replace(/\/$/, '')
}

/** The MCP resource an access token is issued for (RFC 8707 audience). */
export function getMcpResourceUrl(origin: string): string {
  return `${trimOrigin(origin)}/api/mcp`
}

/** Issuer identifier. Root origin, so AS metadata sits at the canonical well-known path. */
export function getOAuthIssuer(origin: string): string {
  return trimOrigin(origin)
}

/** Where the authorize/token/register/revoke endpoints actually live. */
export function getOAuthEndpointBase(origin: string): string {
  return `${trimOrigin(origin)}/api/mcp/oauth`
}

/** The RFC 9728 document a 401 points clients at. */
export function getProtectedResourceMetadataUrl(origin: string): string {
  return `${trimOrigin(origin)}/.well-known/oauth-protected-resource/api/mcp`
}

/**
 * RFC 9728 protected resource metadata. `resourceOverride` exists for the
 * path-inserted alias route, where the resource identifier has to echo the
 * path the client asked about or a strict client rejects the document.
 */
export function buildProtectedResourceMetadata(
  origin: string,
  resourceOverride?: string
) {
  const base = trimOrigin(origin)
  return {
    resource: resourceOverride ?? getMcpResourceUrl(origin),
    authorization_servers: [getOAuthIssuer(origin)],
    bearer_methods_supported: ['header'],
    scopes_supported: [MCP_OAUTH_SCOPE],
    resource_documentation: `${base}/headless`,
  }
}

/**
 * RFC 8414 authorization server metadata. `issuerOverride` serves the same
 * purpose as above: a client that probed `/.well-known/oauth-authorization-server/api/mcp/oauth`
 * derived a pathful issuer and will compare it against this field.
 */
export function buildAuthorizationServerMetadata(
  origin: string,
  issuerOverride?: string
) {
  const base = getOAuthEndpointBase(origin)
  return {
    issuer: issuerOverride ?? getOAuthIssuer(origin),
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    response_types_supported: ['code'],
    // No refresh_token grant: access tokens are long-lived `vsp_live_*`
    // credentials revocable from /headless, so there is nothing to refresh.
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [MCP_OAUTH_SCOPE],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    service_documentation: `${trimOrigin(origin)}/headless`,
  }
}

/** An OAuth error in the RFC 6749 §5.2 shape, carryable through a throw. */
export class OAuthError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, description: string, status = 400) {
    super(description)
    this.name = 'OAuthError'
    this.code = code
    this.status = status
  }

  toJSON(): { error: string; error_description: string } {
    return { error: this.code, error_description: this.message }
  }
}

/**
 * Is this a redirect URI we are willing to send a user's authorization code to?
 *
 * https anywhere, http only on loopback (RFC 8252 native clients), and
 * private-use schemes for desktop apps that register a protocol handler.
 * Everything with a fragment, and everything on the forbidden-scheme list,
 * is rejected. The real protection is that authorize only ever redirects to
 * a URI the client registered and the user saw on the consent screen.
 */
export function isValidRedirectUri(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.hash) return false
  if (FORBIDDEN_REDIRECT_SCHEMES.has(url.protocol)) return false
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname)
  // Private-use scheme (com.example.app:/callback, cursor://…). Require a
  // scheme that at least looks like one rather than accepting anything.
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)
}

/**
 * Validate the `redirect_uris` member of a dynamic client registration
 * request. Throws an OAuthError with the RFC 7591 error code on anything
 * we will not register.
 */
export function normalizeRedirectUris(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OAuthError(
      'invalid_redirect_uri',
      'redirect_uris must be a non-empty array of absolute URIs.'
    )
  }
  if (value.length > MAX_REDIRECT_URIS) {
    throw new OAuthError(
      'invalid_redirect_uri',
      `redirect_uris may contain at most ${MAX_REDIRECT_URIS} entries.`
    )
  }

  const seen: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length > 2048) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'Each redirect_uri must be a string of at most 2048 characters.'
      )
    }
    if (!isValidRedirectUri(entry)) {
      throw new OAuthError(
        'invalid_redirect_uri',
        `Rejected redirect_uri "${entry}". Use https, http on loopback, or a private-use scheme, and no fragment.`
      )
    }
    if (!seen.includes(entry)) seen.push(entry)
  }
  return seen
}

/** base64url with padding stripped, per RFC 7636. */
export function base64UrlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** S256 challenge for a verifier, per RFC 7636 §4.2. */
export function deriveCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest())
}

/**
 * Constant-time PKCE check. `plain` is deliberately unsupported: OAuth 2.1
 * and the MCP authorization spec both require S256.
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  storedChallenge: string
): boolean {
  // RFC 7636 §4.1 — verifiers are 43..128 unreserved characters.
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) return false
  const derived = deriveCodeChallenge(codeVerifier)
  const a = Buffer.from(derived)
  const b = Buffer.from(storedChallenge)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Resolve the public origin for generated URLs.
 *
 * Mirrors `buildMcpUrl` on the self-service credential route: an explicit
 * NEXT_PUBLIC_APP_URL wins, then the Vercel-injected hostnames, then the
 * request itself. Discovery documents that disagree with the host the
 * client dialled will fail an issuer check, so this has to be stable.
 */
export function resolvePublicOrigin(requestUrl: string): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return trimOrigin(explicit)

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelProd) return `https://${vercelProd}`

  const vercelDeploy = process.env.VERCEL_URL?.trim()
  if (vercelDeploy) return `https://${vercelDeploy}`

  return new URL(requestUrl).origin
}
