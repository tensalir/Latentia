import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Use getUser() instead of getSession() for more reliable auth check
  // getSession() can return stale cached data, while getUser() validates with the server
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Skip auth check for API routes
  if (req.nextUrl.pathname.startsWith('/api')) {
    return res
  }

  // If user is not signed in and the current path is not /login or /signup, redirect to /login
  if (!user && !req.nextUrl.pathname.startsWith('/login') && !req.nextUrl.pathname.startsWith('/signup') && !req.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // If user is signed in and tries to access /login or /signup, redirect to /projects
  if (user && (req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/signup'))) {
    return NextResponse.redirect(new URL('/projects', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

