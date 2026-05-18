import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getProfile } from '@/lib/server/admin';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/wardrobe';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  // Build the redirect response up front so Supabase's session cookies can be
  // written directly onto it. Cookies written via next/headers' cookies() do
  // not reliably attach to NextResponse.redirect() in App Router route handlers.
  const safeNext = next.startsWith('/') ? next : '/wardrobe';
  let response = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
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

  const profile = await getProfile(user.id);
  if (!profile) {
    const wardrobeResponse = NextResponse.redirect(`${origin}/wardrobe`);
    response.cookies.getAll().forEach((c) => wardrobeResponse.cookies.set(c));
    return wardrobeResponse;
  }
  return response;
}
