import { test, expect } from '@playwright/test'
import {
  AUTH_CODE_TTL_SECONDS,
  MCP_OAUTH_SCOPE,
  MAX_REDIRECT_URIS,
  OAuthError,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  deriveCodeChallenge,
  getMcpResourceUrl,
  getOAuthEndpointBase,
  getProtectedResourceMetadataUrl,
  isValidRedirectUri,
  normalizeRedirectUris,
  resolvePublicOrigin,
  verifyCodeChallenge,
} from '../src/lib/headless/mcp-oauth'

/**
 * Pure unit tests for the MCP OAuth discovery documents and validation
 * rules. No Next.js, Prisma, or network — the whole point of keeping these
 * helpers separate from the store.
 */

const ORIGIN = 'https://vesper.example'

test.describe('discovery metadata', () => {
  test('authorization server metadata uses a root issuer', () => {
    const meta = buildAuthorizationServerMetadata(ORIGIN)
    // A pathful issuer moves the document to a path-inserted well-known URL
    // that clients then fail to find. Root issuer keeps it where they look.
    expect(meta.issuer).toBe(ORIGIN)
    expect(meta.authorization_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/authorize`)
    expect(meta.token_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/token`)
    expect(meta.registration_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/register`)
    expect(meta.revocation_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/revoke`)
  })

  test('advertises PKCE S256 and the authorization code grant only', () => {
    const meta = buildAuthorizationServerMetadata(ORIGIN)
    expect(meta.code_challenge_methods_supported).toEqual(['S256'])
    expect(meta.grant_types_supported).toEqual(['authorization_code'])
    expect(meta.response_types_supported).toEqual(['code'])
    expect(meta.token_endpoint_auth_methods_supported).toEqual(['none'])
  })

  test('issuer can be overridden for the path-inserted alias', () => {
    const pathful = getOAuthEndpointBase(ORIGIN)
    const meta = buildAuthorizationServerMetadata(ORIGIN, pathful)
    // A client that probed /.well-known/oauth-authorization-server/api/mcp/oauth
    // compares `issuer` against the path it derived and rejects a mismatch.
    expect(meta.issuer).toBe(pathful)
    expect(meta.token_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/token`)
  })

  test('protected resource metadata points at the MCP endpoint', () => {
    const meta = buildProtectedResourceMetadata(ORIGIN)
    expect(meta.resource).toBe(getMcpResourceUrl(ORIGIN))
    expect(meta.resource).toBe(`${ORIGIN}/api/mcp`)
    expect(meta.authorization_servers).toEqual([ORIGIN])
    expect(meta.scopes_supported).toEqual([MCP_OAUTH_SCOPE])
  })

  test('the 401 challenge URL matches the path-inserted document', () => {
    expect(getProtectedResourceMetadataUrl(ORIGIN)).toBe(
      `${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`
    )
  })

  test('trailing slashes in the origin never leak into URLs', () => {
    const meta = buildAuthorizationServerMetadata('https://vesper.example/')
    expect(meta.issuer).toBe(ORIGIN)
    expect(meta.authorization_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/authorize`)
  })

  test('authorization codes are short lived', () => {
    expect(AUTH_CODE_TTL_SECONDS).toBeLessThanOrEqual(600)
  })
})

test.describe('redirect URI validation', () => {
  test('accepts https callbacks', () => {
    expect(isValidRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
  })

  test('accepts http only on loopback', () => {
    expect(isValidRedirectUri('http://localhost:6274/callback')).toBe(true)
    expect(isValidRedirectUri('http://127.0.0.1:8080/cb')).toBe(true)
    expect(isValidRedirectUri('http://example.com/cb')).toBe(false)
  })

  test('accepts private-use schemes for desktop clients', () => {
    expect(isValidRedirectUri('com.example.app:/oauth')).toBe(true)
    expect(isValidRedirectUri('cursor://anysphere/callback')).toBe(true)
  })

  test('rejects script and local-file schemes', () => {
    expect(isValidRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isValidRedirectUri('data:text/html,x')).toBe(false)
    expect(isValidRedirectUri('file:///etc/passwd')).toBe(false)
  })

  test('rejects fragments and garbage', () => {
    expect(isValidRedirectUri('https://claude.ai/cb#frag')).toBe(false)
    expect(isValidRedirectUri('not a url')).toBe(false)
    expect(isValidRedirectUri('/relative/path')).toBe(false)
  })
})

test.describe('normalizeRedirectUris', () => {
  test('deduplicates while preserving order', () => {
    const out = normalizeRedirectUris([
      'https://claude.ai/a',
      'https://claude.ai/b',
      'https://claude.ai/a',
    ])
    expect(out).toEqual(['https://claude.ai/a', 'https://claude.ai/b'])
  })

  test('rejects an empty or missing list', () => {
    expect(() => normalizeRedirectUris([])).toThrow(OAuthError)
    expect(() => normalizeRedirectUris(undefined)).toThrow(OAuthError)
    expect(() => normalizeRedirectUris('https://claude.ai/cb')).toThrow(OAuthError)
  })

  test('rejects more callbacks than a real client needs', () => {
    const many = Array.from(
      { length: MAX_REDIRECT_URIS + 1 },
      (_, i) => `https://claude.ai/cb/${i}`
    )
    expect(() => normalizeRedirectUris(many)).toThrow(OAuthError)
  })

  test('reports the RFC 7591 error code', () => {
    try {
      normalizeRedirectUris(['http://evil.example/cb'])
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(OAuthError)
      expect((error as OAuthError).code).toBe('invalid_redirect_uri')
      expect((error as OAuthError).toJSON().error).toBe('invalid_redirect_uri')
    }
  })
})

test.describe('PKCE', () => {
  // RFC 7636 Appendix B worked example.
  const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

  test('derives the challenge from the RFC test vector', () => {
    expect(deriveCodeChallenge(VERIFIER)).toBe(CHALLENGE)
  })

  test('verifies a matching verifier', () => {
    expect(verifyCodeChallenge(VERIFIER, CHALLENGE)).toBe(true)
  })

  test('rejects a mismatched verifier', () => {
    const other = 'a'.repeat(43)
    expect(verifyCodeChallenge(other, CHALLENGE)).toBe(false)
  })

  test('rejects verifiers outside the RFC length range', () => {
    expect(verifyCodeChallenge('too-short', deriveCodeChallenge('too-short'))).toBe(false)
    const tooLong = 'a'.repeat(129)
    expect(verifyCodeChallenge(tooLong, deriveCodeChallenge(tooLong))).toBe(false)
  })

  test('rejects verifiers with characters outside the unreserved set', () => {
    const illegal = `${'a'.repeat(42)}$`
    expect(verifyCodeChallenge(illegal, deriveCodeChallenge(illegal))).toBe(false)
  })
})

test.describe('resolvePublicOrigin', () => {
  test('prefers an explicit app URL over the request host', () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://vesper.loop.dev/'
    try {
      expect(resolvePublicOrigin('https://some-preview.vercel.app/api/mcp')).toBe(
        'https://vesper.loop.dev'
      )
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = previous
    }
  })

  test('falls back to the request origin', () => {
    const app = process.env.NEXT_PUBLIC_APP_URL
    const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
    const deploy = process.env.VERCEL_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
    try {
      expect(resolvePublicOrigin('http://localhost:3000/api/mcp')).toBe(
        'http://localhost:3000'
      )
    } finally {
      if (app !== undefined) process.env.NEXT_PUBLIC_APP_URL = app
      if (prod !== undefined) process.env.VERCEL_PROJECT_PRODUCTION_URL = prod
      if (deploy !== undefined) process.env.VERCEL_URL = deploy
    }
  })
})
