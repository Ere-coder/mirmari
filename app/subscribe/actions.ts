'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * joinWaitlist — creates a subscription row with status='waitlisted'.
 *
 * Idempotent: if the user already has a subscription, redirects to /wardrobe.
 * Used as a native form action on the /subscribe page.
 */
export async function joinWaitlist(): Promise<void> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // Idempotency: don't create a duplicate row
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    redirect('/wardrobe');
  }

  const { error } = await supabase
    .from('subscriptions')
    .insert({ user_id: user.id, status: 'waitlisted' });

  if (error) {
    // If there's a unique violation (race condition), still go to wardrobe
    redirect('/wardrobe');
  }

  redirect('/wardrobe');
}
