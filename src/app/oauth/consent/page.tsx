import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getPendingAuthorizationRequest } from '@/lib/headless/mcp-oauth-store'

export const metadata = {
  title: 'Connect to Vesper',
  robots: { index: false, follow: false },
}

// Per-request: this page reflects one short-lived authorization request.
export const dynamic = 'force-dynamic'

/**
 * Consent screen for the MCP OAuth flow.
 *
 * `/api/mcp/oauth/authorize` sends the user here after it has verified the
 * client and the callback and confirmed they are signed in. The only thing
 * carried across is the request id — every detail shown below is read back
 * from the database, so a doctored URL cannot change what is being approved.
 *
 * The form posts back to the authorize endpoint, which mints the code.
 */
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: { request?: string }
}) {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const target = `/oauth/consent?request=${encodeURIComponent(searchParams.request ?? '')}`
    redirect(`/login?redirect=${encodeURIComponent(target)}`)
  }

  const requestId = searchParams.request ?? ''
  const pending = requestId
    ? await getPendingAuthorizationRequest(requestId, user.id)
    : null

  if (!pending) {
    return (
      <Shell title="This request has expired">
        <p className="text-[#b8b8b8]">
          Authorization requests are only valid for a few minutes. Start the
          connection again from your MCP client.
        </p>
        <Link href="/headless" className="mt-6 inline-block underline">
          Back to Vesper Headless
        </Link>
      </Shell>
    )
  }

  const clientName = pending.client.clientName?.trim() || pending.client.clientId
  const callbackHost = safeHost(pending.redirectUri)

  return (
    <Shell title={`Connect ${clientName} to Vesper?`}>
      <p className="text-[#b8b8b8]">
        Signed in as <span className="text-[#f5f5f5]">{user.email}</span>.
        Approving issues this client a Vesper access token that can:
      </p>

      <ul className="mt-4 space-y-2 text-[#b8b8b8]">
        <li>• Enhance and iterate prompts with the Loop Gen-AI skill</li>
        <li>• List models and Loop product renders</li>
        <li>• Generate images and video, billed to Loop&apos;s provider accounts</li>
      </ul>

      <dl className="mt-6 space-y-2 text-sm text-[#8a8a8a]">
        <div className="flex gap-2">
          <dt className="min-w-24">Sends code to</dt>
          <dd className="break-all text-[#b8b8b8]">{callbackHost}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-24">Client ID</dt>
          <dd className="break-all text-[#b8b8b8]">{pending.client.clientId}</dd>
        </div>
      </dl>

      <form method="post" action="/api/mcp/oauth/authorize" className="mt-8 flex gap-3">
        <input type="hidden" name="request_id" value={pending.id} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded-md bg-[#f5f5f5] px-4 py-2 font-medium text-[#141414] transition hover:bg-white"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="rounded-md border border-[#333333] px-4 py-2 text-[#b8b8b8] transition hover:border-[#555555] hover:text-[#f5f5f5]"
        >
          Cancel
        </button>
      </form>

      <p className="mt-6 text-sm text-[#6f6f6f]">
        You can revoke this at any time from{' '}
        <Link href="/headless" className="underline">
          Vesper Headless
        </Link>
        .
      </p>
    </Shell>
  )
}

function Shell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#141414] p-6 text-[#f5f5f5]">
      <main className="w-full max-w-lg rounded-lg border border-[#333333] bg-[#1a1a1a] p-8">
        <h1 className="text-xl font-medium">{title}</h1>
        <div className="mt-4">{children}</div>
      </main>
    </div>
  )
}

/** Show the callback's origin rather than a long URL with query junk. */
function safeHost(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return value
  }
}
