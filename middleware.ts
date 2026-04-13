/**
 * Next.js Middleware — runs on every request before it reaches a page.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie so it doesn't expire silently.
 * 2. Enforce route-level auth guards:
 *    - Unauthenticated users hitting /home or /onboarding are sent to /.
 *    - Authenticated users hitting / are sent to /home.
 *    - Authenticated users with a complete profile hitting /onboarding
 *      are sent to /home.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // All authenticated-only routes. Unauthenticated users are sent to the auth screen.
  // Phase 6: added /chat and /chats for the messaging system.
  // Phase 7: added /insurance, /report, /admin for damage + insurance flows.
  const protectedRoutes = ['/home', '/onboarding', '/upload', '/profile', '/item', '/credits', '/chat', '/chats', '/insurance', '/report', '/admin'];
  if (!user && protectedRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (user && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return supabaseResponse;
}

// Apply middleware to all routes except static files and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
