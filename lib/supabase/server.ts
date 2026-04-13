/**
 * Supabase server client — used in Server Components, Route Handlers,
 * and Server Actions. Reads/writes cookies via Next.js's cookies() API
 * so the session is shared between client and server without extra fetches.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component where cookies are
            // read-only. The middleware handles the actual cookie refresh.
          }
        },
      },
    }
  );
}
