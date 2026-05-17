'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import type { ActionResult } from '@/lib/types-v2';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  if (!await isAdminUser(user.id)) return { supabase: null, user: null };
  return { supabase, user };
}

export async function logReturn(
  reservationId: string,
  condition:     'good' | 'minor_issue' | 'damaged',
  notes:         string
): Promise<ActionResult> {
  const { supabase, user } = await verifyAdmin();
  if (!supabase || !user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('return_events')
    .insert({
      reservation_id: reservationId,
      admin_id:       user.id,
      condition,
      notes:          notes.trim() || null,
    });

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/returns');
  return { success: true };
}
