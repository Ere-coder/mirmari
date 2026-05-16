/**
 * Next.js Middleware — runs on every request before it reaches a page.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie so it doesn't expire silently.
 * 2. Enforce route-level auth guards:
 *    - Unauthenticated users hitting protected routes are sent to /.
 *    - Authenticated users hitting / are sent to /wardrobe (v2 home).
 *    - v1 routes remain guarded during transition; removed in Phase 9.
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
  // v2 Phase 1: replaced /upload, /item, /credits, /chat, /chats with v2 routes.
  // v1 routes (/home, /upload, /item, /credits, /chat, /chats, /insurance, /report)
  // remain guarded during transition; removed in Phase 9 cleanup.
  const protectedRoutes = [
    // v2 routes
    '/wardrobe', '/schedule', '/messages', '/subscribe',
    // shared / kept routes
    '/onboarding', '/profile', '/admin',
    // v1 routes still active during transition
    '/home', '/upload', '/item', '/credits', '/chat', '/chats', '/insurance', '/report',
  ];
  if (!user && protectedRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (user && pathname === '/') {
    // v2: authenticated users land on /wardrobe (was /home in v1)
    return NextResponse.redirect(new URL('/wardrobe', request.url));
  }

  return supabaseResponse;
}

// Apply middleware to all routes except static files and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
