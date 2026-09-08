import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public routes that don't require authentication checks
// Includes password recovery pages so unauthenticated users can reset their password
const PUBLIC_ROUTES = ['/login', '/signup', '/auth', '/forgot-password', '/reset-password']

// Routes that skip middleware entirely (no auth call needed).
//
// `/.well-known` has to be here: OAuth and MCP clients fetch those discovery
// documents anonymously, before any login exists. Bouncing them to /login is
// what made "Add custom connector" fail with "Couldn't register with Vesper's
// sign-in service" — the client got an HTML login page where JSON metadata
// was supposed to be.
const SKIP_AUTH_ROUTES = ['/api', '/.well-known']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route))
}

function shouldSkipAuth(pathname: string): boolean {
  return SKIP_AUTH_ROUTES.some(route => pathname.startsWith(route))
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

  // Skip auth check entirely for API routes - no Supabase call needed
  if (shouldSkipAuth(pathname)) {
    return res
  }

  // For public routes (login, signup, auth), we only need to check auth
  // if we want to redirect already-logged-in users away
  // Use getSession() here as it's cached and faster - we just need a quick check
  const supabase = createMiddlewareClient({ req, res })
  
  if (isPublicRoute(pathname)) {
    // Only check session to redirect logged-in users away from login/signup
    // getSession() is faster as it uses cached data
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session && (pathname.startsWith('/login') || pathname.startsWith('/signup'))) {
      return NextResponse.redirect(new URL('/projects', req.url))
    }
    // Allow access to public routes without further checks
    return res
  }

  // For protected routes, use getUser() for reliable server-validated auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login, remembering where they were
  // headed. The OAuth consent screen depends on this: a user who is sent to
  // sign in mid-connection has to land back on the authorization they were
  // approving, not on /projects.
  if (!user) {
    const login = new URL('/login', req.url)
    if (pathname !== '/') {
      login.searchParams.set('redirect', `${pathname}${req.nextUrl.search}`)
    }
    return NextResponse.redirect(login)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|fonts).*)'],
}

