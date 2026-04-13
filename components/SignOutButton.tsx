/**
 * SignOutButton — Client Component.
 *
 * Calls supabase.auth.signOut() then redirects to / (auth screen).
 * Extracted as a Client Component because the home page is a Server
 * Component and onClick handlers require client-side interactivity.
 */
'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();

  // createClient() is called inside the handler, not at the component top level.
  // 'use client' components still run on the server during SSR pre-render, so
  // any top-level call would throw without Supabase env vars.
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh(); // Clear any cached server data
  }

  return (
    <button
      onClick={handleSignOut}
      className="
        px-5 py-2.5 rounded-xl
        border border-brand-dark/20
        text-sm font-medium text-brand-dark/70
        transition-opacity active:opacity-60
      "
    >
      Sign out
    </button>
  );
}
