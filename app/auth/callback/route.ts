/**
 * OAuth Callback Route — /auth/callback
 *
 * After Google OAuth completes, Supabase redirects here with a short-lived
 * `code` parameter. This route handler exchanges the code for a full session
 * (access token + refresh token), stores it in cookies, then determines
 * where to send the user:
 *
 * - If the user has no profile row in `profiles` → /onboarding
 * - If the user has a complete profile            → /home
 *
 * This is a Next.js Route Handler (App Router), not a Server Component.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    // No code means something went wrong with the OAuth flow
    return NextResponse.redirect(`${origin}/?error=oauth_failed`);
  }

  const cookieStore = cookies();

  // Collect every cookie Supabase wants to write so we can apply them
  // directly to the redirect response. In Next.js 14 App Router Route
  // Handlers, cookies().set() mutations are not reliably merged into a
  // NextResponse.redirect() — so we capture them here and set them manually.
  const pendingCookies: { name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Write to cookieStore so subsequent reads in this handler work,
          // AND queue them for explicit application to the redirect response.
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            pendingCookies.push({ name, value, options });
          });
        },
      },
    }
  );

  // Exchange the OAuth code for a session — this triggers setAll above
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/?error=session_failed`);
  }

  // Check whether this user has completed onboarding
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/`);
  }

  // Query the profiles table — if no row exists, onboarding is needed
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  const redirectUrl = profile ? `${origin}/home` : `${origin}/onboarding`;
  const response = NextResponse.redirect(redirectUrl);

  // Explicitly apply the session cookies onto the redirect response so the
  // browser receives them and the middleware sees the session on the next request.
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options ?? {});
  });

  return response;
}
