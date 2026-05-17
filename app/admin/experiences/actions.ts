'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types-v2';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  const { data: p } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!p?.is_admin) return { supabase: null, user: null };
  return { supabase, user };
}

export async function createExperience(
  userId:      string,
  outfitSetId: string | null,
  imageUrl:    string,
  caption:     string
): Promise<ActionResult> {
  const { supabase, user } = await verifyAdmin();
  if (!supabase || !user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('outfit_experiences')
    .insert({
      user_id:       userId,
      outfit_set_id: outfitSetId || null,
      admin_id:      user.id,
      image_url:     imageUrl,
      caption:       caption.trim() || null,
    });

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/experiences');
  revalidatePath('/profile');
  return { success: true };
}

export async function deleteExperience(experienceId: string, _formData?: FormData): Promise<void> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from('outfit_experiences')
    .delete()
    .eq('id', experienceId);

  if (error) { console.error('[deleteExperience]', error.message); return; }

  revalidatePath('/admin/experiences');
}
