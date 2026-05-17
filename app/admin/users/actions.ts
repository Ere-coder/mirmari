'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import type { ActionResult, SubscriptionStatus } from '@/lib/types-v2';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null };
  if (!await isAdminUser(user.id)) return { supabase: null };
  return { supabase };
}

export async function updateSubscriptionStatus(
  userId: string,
  newStatus: SubscriptionStatus,
): Promise<ActionResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  // If activating: set billing_anchor_day to today's day-of-month
  const extra =
    newStatus === 'active'
      ? { billing_anchor_day: new Date().getDate() }
      : {};

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: newStatus, ...extra })
    .eq('user_id', userId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/users');
  revalidatePath('/admin');
  return { success: true };
}

export async function createSubscriptionForUser(
  userId: string,
): Promise<ActionResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('subscriptions')
    .insert({ user_id: userId, status: 'waitlisted' });

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}
