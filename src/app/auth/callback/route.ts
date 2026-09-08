import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Only ever bounce back to a path on this origin. A `redirect` value that
 * starts with `//` or names another host is discarded — an open redirector
 * on the login route is exactly what an attacker would want here.
 */
function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const cookieStore = cookies()

  if (code) {
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('[auth/callback] Error exchanging code for session:', error.message)
      // Redirect to login with error
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', requestUrl.origin))
    }

    // If this is a password recovery flow, redirect to the reset password page
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/reset-password', requestUrl.origin))
    }
  }

  // URL to redirect to after sign in process completes. The OAuth consent
  // flow sends users through here mid-connection, so an explicit target wins
  // over the default landing page.
  const target = safeRedirectPath(requestUrl.searchParams.get('redirect'))
  return NextResponse.redirect(new URL(target ?? '/projects', requestUrl.origin))
}

