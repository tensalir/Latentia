/**
 * MCP OAuth 2.1 metadata helpers for Vesper headless.
 *
 * Bearer tokens (vsp_live_*) remain supported during migration. OAuth
 * gives claude.ai web connectors a browser login path like Higgsfield.
 */

export function getMcpResourceUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/mcp`
}

export function getOAuthServerUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/mcp/oauth`
}

export function buildProtectedResourceMetadata(origin: string) {
  const resource = getMcpResourceUrl(origin)
  const authServer = getOAuthServerUrl(origin)
  return {
    resource,
    authorization_servers: [authServer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:tools'],
    resource_documentation: `${origin.replace(/\/$/, '')}/headless`,
  }
}

export function buildAuthorizationServerMetadata(origin: string) {
  const base = getOAuthServerUrl(origin)
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:tools'],
    token_endpoint_auth_methods_supported: ['none'],
  }
}
