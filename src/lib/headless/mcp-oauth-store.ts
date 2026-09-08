/**
 * Database side of the MCP OAuth flow: registered clients, consent requests,
 * authorization codes, and the token exchange.
 *
 * The one design decision worth knowing: an OAuth access token IS a
 * `HeadlessCredential` row — the same `vsp_live_*` credential the /headless
 * page mints by hand. So every guard already built for the bearer surface
 * (tool allowlists, model allowlists, durable rate limits, audit logging,
 * revocation) covers OAuth clients without a second code path, and a user
 * can revoke a connector from the same place they revoke everything else.
 *
 * A single `McpOAuthAuthorization` row carries an authorization through both
 * of its stages. It is created as a pending consent request with an
 * unguessable id and no code; the code only comes into existence when a
 * signed-in user approves that specific row. That is also what protects the
 * consent POST from cross-site forgery: an attacker cannot mint a request
 * bound to someone else's session, and cannot guess the id of one.
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { issueCredential } from './credentials'
import { hashHeadlessToken } from './tokens'
import type { HeadlessTool } from './auth'
import { MCP_TOOLS } from './mcp-tools'
import {
  AUTH_CODE_TTL_SECONDS,
  AUTH_REQUEST_TTL_SECONDS,
  MCP_OAUTH_SCOPE,
  OAuthError,
  verifyCodeChallenge,
} from './mcp-oauth'

/**
 * Browser-authorised connectors get the full MCP tool surface, matching what
 * /headless hands out for a self-issued token. Derived from MCP_TOOLS so a
 * newly added tool cannot silently go missing from OAuth credentials.
 */
const OAUTH_ISSUED_TOOLS: HeadlessTool[] = MCP_TOOLS.map((tool) => tool.name)

/** `*` = every model in the registry, same as the self-service page. */
const OAUTH_ISSUED_MODELS = ['*']

/** Expired rows are swept opportunistically; there is no cron on this table. */
const SWEEP_AFTER_HOURS = 24

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function base64Url(bytes: Buffer): string {
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export interface RegisterClientInput {
  clientName?: string
  redirectUris: string[]
  grantTypes?: string[]
  responseTypes?: string[]
  scope?: string
  clientUri?: string
  logoUri?: string
  softwareId?: string
  softwareVersion?: string
}

export interface RegisteredClient {
  clientId: string
  clientName: string | null
  redirectUris: string[]
  grantTypes: string[]
  responseTypes: string[]
  scope: string | null
  tokenEndpointAuthMethod: string
  clientUri: string | null
  logoUri: string | null
  softwareId: string | null
  softwareVersion: string | null
  createdAt: Date
}

/**
 * RFC 7591 dynamic client registration. Public clients only — no secret is
 * issued, and PKCE carries the security instead. Registration is
 * unauthenticated by design (that is what makes "paste the URL and click
 * connect" work), which is safe because a registration on its own grants
 * nothing: a Loop user still has to sign in and approve the connection.
 */
export async function registerOAuthClient(
  input: RegisterClientInput
): Promise<RegisteredClient> {
  const clientId = `vsp_mcp_${crypto.randomBytes(16).toString('hex')}`

  const client = await prisma.mcpOAuthClient.create({
    data: {
      clientId,
      clientName: input.clientName ?? null,
      redirectUris: input.redirectUris,
      grantTypes: input.grantTypes ?? ['authorization_code'],
      responseTypes: input.responseTypes ?? ['code'],
      scope: input.scope ?? MCP_OAUTH_SCOPE,
      tokenEndpointAuthMethod: 'none',
      clientUri: input.clientUri ?? null,
      logoUri: input.logoUri ?? null,
      softwareId: input.softwareId ?? null,
      softwareVersion: input.softwareVersion ?? null,
    },
  })

  return {
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUris: client.redirectUris,
    grantTypes: client.grantTypes,
    responseTypes: client.responseTypes,
    scope: client.scope,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    clientUri: client.clientUri,
    logoUri: client.logoUri,
    softwareId: client.softwareId,
    softwareVersion: client.softwareVersion,
    createdAt: client.createdAt,
  }
}

export async function findOAuthClient(clientId: string) {
  if (!clientId) return null
  return prisma.mcpOAuthClient.findUnique({ where: { clientId } })
}

export interface CreateAuthorizationRequestInput {
  clientId: string
  userId: string
  redirectUri: string
  scope: string | null
  state: string | null
  resource: string | null
  codeChallenge: string
}

/**
 * Record a pending consent request and return its id. The id is the only
 * thing handed to the browser; it is a v4 uuid from the database, so it
 * cannot be guessed by a third-party page trying to forge an approval.
 */
export async function createAuthorizationRequest(
  input: CreateAuthorizationRequestInput
): Promise<string> {
  await sweepExpiredAuthorizations()

  const row = await prisma.mcpOAuthAuthorization.create({
    data: {
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      state: input.state,
      resource: input.resource,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_SECONDS * 1000),
    },
    select: { id: true },
  })

  await prisma.mcpOAuthClient.update({
    where: { clientId: input.clientId },
    data: { lastUsedAt: new Date() },
  })

  return row.id
}

/**
 * Load a pending consent request for display. Scoped to the signed-in user
 * so one person can never be shown, or asked to approve, another's request.
 */
export async function getPendingAuthorizationRequest(
  requestId: string,
  userId: string
) {
  if (!isUuid(requestId)) return null

  const row = await prisma.mcpOAuthAuthorization.findFirst({
    where: {
      id: requestId,
      userId,
      approvedAt: null,
      deniedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { client: true },
  })
  return row
}

export interface ApprovalResult {
  redirectUri: string
  state: string | null
  code: string
}

/**
 * Turn an approved consent request into an authorization code. The code is
 * returned once, in plaintext, for the redirect; only its hash is stored.
 */
export async function approveAuthorizationRequest(
  requestId: string,
  userId: string
): Promise<ApprovalResult> {
  const pending = await getPendingAuthorizationRequest(requestId, userId)
  if (!pending) {
    throw new OAuthError(
      'invalid_request',
      'This authorization request has expired or was already answered. Start the connection again from your MCP client.'
    )
  }

  const code = `vsp_ac_${base64Url(crypto.randomBytes(32))}`

  // updateMany with the pending predicate keeps the transition atomic: two
  // concurrent approvals of the same request cannot both mint a code.
  const claimed = await prisma.mcpOAuthAuthorization.updateMany({
    where: {
      id: requestId,
      userId,
      approvedAt: null,
      deniedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      codeHash: sha256(code),
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    },
  })

  if (claimed.count !== 1) {
    throw new OAuthError(
      'invalid_request',
      'This authorization request was already answered.'
    )
  }

  return {
    redirectUri: pending.redirectUri,
    state: pending.state,
    code,
  }
}

/** Mark a consent request refused. The client is told `access_denied`. */
export async function denyAuthorizationRequest(
  requestId: string,
  userId: string
): Promise<{ redirectUri: string; state: string | null }> {
  const pending = await getPendingAuthorizationRequest(requestId, userId)
  if (!pending) {
    throw new OAuthError(
      'invalid_request',
      'This authorization request has expired or was already answered.'
    )
  }

  await prisma.mcpOAuthAuthorization.updateMany({
    where: { id: requestId, userId, approvedAt: null, deniedAt: null },
    data: { deniedAt: new Date() },
  })

  return { redirectUri: pending.redirectUri, state: pending.state }
}

export interface ExchangeCodeInput {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}

export interface ExchangeCodeResult {
  accessToken: string
  scope: string
}

/**
 * Exchange an authorization code for an access token.
 *
 * The code is burned before anything else is checked, so a code can only
 * ever be spent once even under concurrent requests, and a wrong PKCE
 * verifier cannot be retried against the same code.
 */
export async function exchangeAuthorizationCode(
  input: ExchangeCodeInput
): Promise<ExchangeCodeResult> {
  const codeHash = sha256(input.code)

  const burned = await prisma.mcpOAuthAuthorization.updateMany({
    where: {
      codeHash,
      consumedAt: null,
      deniedAt: null,
      approvedAt: { not: null },
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  })

  if (burned.count !== 1) {
    throw new OAuthError(
      'invalid_grant',
      'Authorization code is invalid, expired, or has already been used.'
    )
  }

  const row = await prisma.mcpOAuthAuthorization.findUnique({
    where: { codeHash },
    include: { client: true },
  })
  if (!row) {
    throw new OAuthError('invalid_grant', 'Authorization code is invalid.')
  }

  if (row.clientId !== input.clientId) {
    throw new OAuthError(
      'invalid_grant',
      'Authorization code was issued to a different client.'
    )
  }

  if (row.redirectUri !== input.redirectUri) {
    throw new OAuthError(
      'invalid_grant',
      'redirect_uri does not match the one used to obtain this code.'
    )
  }

  if (!verifyCodeChallenge(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed.')
  }

  // Re-check the grant right before minting: headless access may have been
  // withdrawn, or the account paused, between consent and exchange.
  await assertHeadlessAccess(row.userId)

  const label = row.client.clientName?.trim() || row.clientId
  const accessToken = await issueOAuthCredential({
    userId: row.userId,
    clientId: row.clientId,
    label,
  })

  return { accessToken, scope: row.scope ?? MCP_OAUTH_SCOPE }
}

/**
 * Mint the credential that backs an OAuth access token, replacing whatever
 * this client last held for this user so reconnecting does not leave a trail
 * of live tokens behind.
 */
async function issueOAuthCredential(input: {
  userId: string
  clientId: string
  label: string
}): Promise<string> {
  await prisma.headlessCredential.updateMany({
    where: {
      ownerId: input.userId,
      oauthClientId: input.clientId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'replaced by a new OAuth authorization',
    },
  })

  const issued = await issueCredential({
    ownerId: input.userId,
    name: `OAuth — ${input.label}`.slice(0, 120),
    allowedTools: OAUTH_ISSUED_TOOLS,
    allowedModels: OAUTH_ISSUED_MODELS,
    oauthClientId: input.clientId,
  })

  return issued.rawToken
}

/**
 * The gate from the /headless page, applied to the OAuth flow: admins, or
 * users explicitly granted headless access, and never a paused or deleted
 * account.
 */
export async function assertHeadlessAccess(userId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true, headlessAccess: true, pausedAt: true, deletedAt: true },
  })

  if (!profile || profile.deletedAt) {
    throw new OAuthError('access_denied', 'This account no longer exists.', 403)
  }
  if (profile.pausedAt) {
    throw new OAuthError('access_denied', 'This account is paused.', 403)
  }
  if (profile.role !== 'admin' && !profile.headlessAccess) {
    throw new OAuthError(
      'access_denied',
      'Headless access has not been granted to this account. Ask a Vesper admin to enable it.',
      403
    )
  }
}

/**
 * RFC 7009 token revocation. Deliberately limited to credentials this flow
 * issued, so a stray revoke call can never take down an admin-issued partner
 * token that happens to be guessed or logged.
 */
export async function revokeOAuthAccessToken(token: string): Promise<number> {
  // Same hash function the verifier uses, imported rather than re-derived so
  // the two can never drift apart.
  const tokenHash = hashHeadlessToken(token)
  const result = await prisma.headlessCredential.updateMany({
    where: {
      tokenHash,
      oauthClientId: { not: null },
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'revoked via OAuth revocation endpoint',
    },
  })
  return result.count
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  )
}

/** Best-effort housekeeping; never allowed to break an authorization. */
async function sweepExpiredAuthorizations(): Promise<void> {
  try {
    await prisma.mcpOAuthAuthorization.deleteMany({
      where: {
        expiresAt: { lt: new Date(Date.now() - SWEEP_AFTER_HOURS * 3600 * 1000) },
      },
    })
  } catch {
    // A full table is not a reason to refuse a login.
  }
}
