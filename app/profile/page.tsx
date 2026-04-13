/**
 * Profile Page — route: /profile
 *
 * Redirects the authenticated user to their own profile page at /profile/[id].
 * The actual profile UI lives in app/profile/[id]/page.tsx.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  redirect(`/profile/${user.id}`);
}
