/**
 * Supabase browser client — used in Client Components ("use client").
 *
 * @supabase/ssr's createBrowserClient automatically handles cookie-based
 * session storage so the auth state persists across page navigations and
 * is readable by both the browser and the Next.js server/middleware.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
