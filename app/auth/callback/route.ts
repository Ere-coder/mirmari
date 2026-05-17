import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/wardrobe';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const cookieStore = cookies();
  const pendingCookies: { name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            pendingCookies.push({ name, value, options });
          });
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=session_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  // New user (no profile) → wardrobe to browse; they'll hit onboarding when they try an action
  // Returning user → go to where they came from, or wardrobe
  const safeNext   = next.startsWith('/') ? next : '/wardrobe';
  const redirectUrl = profile ? `${origin}${safeNext}` : `${origin}/wardrobe`;
  const response   = NextResponse.redirect(redirectUrl);

  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options ?? {});
  });

  return response;
}
