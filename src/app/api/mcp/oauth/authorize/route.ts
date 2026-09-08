import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api/auth'
import { OAuthError } from '@/lib/headless/mcp-oauth'
import {
  approveAuthorizationRequest,
  assertHeadlessAccess,
  createAuthorizationRequest,
  denyAuthorizationRequest,
  findOAuthClient,
} from '@/lib/headless/mcp-oauth-store'

export const dynamic = 'force-dynamic'

/**
 * OAuth 2.1 authorization endpoint.
 *
 * GET validates the request, makes sure a Vesper user is signed in, and
 * hands off to the consent screen at /oauth/consent. POST is where that
 * screen submits the user's answer; approving mints the authorization code
 * and redirects back to the client.
 *
 * Error handling follows RFC 6749 §4.1.2.1: problems with `client_id` or
 * `redirect_uri` are shown in the browser, because redirecting an
 * unverified callback is how open redirectors are built. Everything after
 * those two are verified goes back to the client as an `error` parameter.
 */

interface ProblemPage {
  title: string
  detail: string
  status: number
}

function problem({ title, detail, status }: ProblemPage): NextResponse {
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] as string
    )

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)} — Vesper</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#141414; color:#f5f5f5; font:15px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; padding:24px; }
  main { max-width:34rem; }
  h1 { font-size:1.25rem; margin:0 0 .75rem; }
  p { margin:0 0 1rem; color:#b8b8b8; }
  a { color:#f5f5f5; }
</style></head>
<body><main>
  <h1>${escape(title)}</h1>
  <p>${escape(detail)}</p>
  <p><a href="/headless">Back to Vesper Headless</a></p>
</main></body></html>`

  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** Send an OAuth error back to a callback we have already verified. */
function redirectWithError(
  redirectUri: string,
  code: string,
  description: string,
  state: string | null
): NextResponse {
  const target = new URL(redirectUri)
  target.searchParams.set('error', code)
  target.searchParams.set('error_description', description)
  if (state) target.searchParams.set('state', state)
  return NextResponse.redirect(target.toString(), 302)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const params = url.searchParams

  const clientId = params.get('client_id') ?? ''
  const client = await findOAuthClient(clientId)
  if (!client) {
    return problem({
      title: 'Unknown client',
      detail:
        'This MCP client is not registered with Vesper. Remove the connector and add it again so it can register itself.',
      status: 400,
    })
  }

  // A client that registered exactly one callback may omit it, per RFC 6749.
  const requestedRedirect = params.get('redirect_uri')
  const redirectUri =
    requestedRedirect ??
    (client.redirectUris.length === 1 ? client.redirectUris[0] : null)

  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return problem({
      title: 'Redirect URI mismatch',
      detail:
        'The callback address this client asked for is not one it registered. Nothing was sent to it.',
      status: 400,
    })
  }

  const state = params.get('state')

  if (params.get('response_type') !== 'code') {
    return redirectWithError(
      redirectUri,
      'unsupported_response_type',
      'Vesper only supports the authorization code flow.',
      state
    )
  }

  const codeChallenge = params.get('code_challenge')
  const codeChallengeMethod = params.get('code_challenge_method') ?? 'plain'
  if (!codeChallenge) {
    return redirectWithError(
      redirectUri,
      'invalid_request',
      'PKCE is required: send code_challenge with code_challenge_method=S256.',
      state
    )
  }
  if (codeChallengeMethod !== 'S256') {
    return redirectWithError(
      redirectUri,
      'invalid_request',
      'Only the S256 code challenge method is supported.',
      state
    )
  }

  // Not signed in: send them through the normal Vesper login and come back
  // to this exact authorize URL afterwards.
  //
  // `skipProfileCheck` matters here. Without it a paused or deleted account
  // reads as "no session" and gets bounced to a login it already has;
  // assertHeadlessAccess below says what is actually wrong instead.
  const { user } = await getAuthUser({ skipProfileCheck: true })
  if (!user) {
    const login = new URL('/login', request.url)
    login.searchParams.set('redirect', `${url.pathname}${url.search}`)
    return NextResponse.redirect(login.toString(), 302)
  }

  try {
    await assertHeadlessAccess(user.id)
  } catch (error) {
    if (error instanceof OAuthError) {
      return problem({
        title: 'No headless access',
        detail: error.message,
        status: error.status,
      })
    }
    throw error
  }

  const requestId = await createAuthorizationRequest({
    clientId: client.clientId,
    userId: user.id,
    redirectUri,
    scope: params.get('scope'),
    state,
    resource: params.get('resource'),
    codeChallenge,
  })

  const consent = new URL('/oauth/consent', request.url)
  consent.searchParams.set('request', requestId)
  return NextResponse.redirect(consent.toString(), 302)
}

/**
 * Consent decision from /oauth/consent.
 *
 * The request id is the CSRF defence: it is a v4 uuid created under this
 * user's session at GET time, so a third-party page can neither guess one
 * nor create one bound to someone else.
 */
export async function POST(request: NextRequest) {
  const { user } = await getAuthUser({ skipProfileCheck: true })
  if (!user) {
    return problem({
      title: 'Session expired',
      detail:
        'Sign in to Vesper again and restart the connection from your MCP client.',
      status: 401,
    })
  }

  const form = await request.formData()
  const requestId = String(form.get('request_id') ?? '')
  const decision = String(form.get('decision') ?? '')

  try {
    if (decision === 'approve') {
      await assertHeadlessAccess(user.id)
      const approved = await approveAuthorizationRequest(requestId, user.id)
      const target = new URL(approved.redirectUri)
      target.searchParams.set('code', approved.code)
      if (approved.state) target.searchParams.set('state', approved.state)
      return NextResponse.redirect(target.toString(), 303)
    }

    const denied = await denyAuthorizationRequest(requestId, user.id)
    const target = new URL(denied.redirectUri)
    target.searchParams.set('error', 'access_denied')
    target.searchParams.set(
      'error_description',
      'The Vesper user declined this connection.'
    )
    if (denied.state) target.searchParams.set('state', denied.state)
    return NextResponse.redirect(target.toString(), 303)
  } catch (error) {
    if (error instanceof OAuthError) {
      return problem({
        title: 'Could not complete authorization',
        detail: error.message,
        status: error.status,
      })
    }
    console.error('[mcp-oauth] authorization decision failed', error)
    return problem({
      title: 'Could not complete authorization',
      detail: 'Something went wrong on our side. Try connecting again.',
      status: 500,
    })
  }
}
