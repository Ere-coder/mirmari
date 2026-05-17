/**
 * Next.js Middleware — runs on every request before it reaches a page.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie so it doesn't expire silently.
 * 2. Enforce route-level auth guards:
 *    - Unauthenticated users hitting protected routes are sent to /.
 *    - Authenticated users hitting / are sent to /wardrobe (v2 home).
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
  // /wardrobe is intentionally public (browse without login).
  const protectedRoutes = [
    '/schedule', '/messages', '/subscribe',
    '/onboarding', '/profile', '/admin',
  ];
  if (!user && protectedRoutes.some(r => pathname.startsWith(r))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

// Apply middleware to all routes except static files and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
