/**
 * Auth Screen — route: /
 *
 * - Full screen, centered layout.
 * - Icon mark (icon.svg) above the wordmark (wordmark.svg).
 * - Single "Continue with Google" button via Supabase Google OAuth.
 *
 * If the user is already logged in, middleware.ts redirects them to /home
 * before this page renders, so no explicit session check is needed here.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  redirect('/wardrobe');
}
