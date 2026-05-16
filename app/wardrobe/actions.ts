'use server';

import { createClient } from '@/lib/supabase/server';

export type ToggleSaveResult =
  | { success: true; saved: boolean }
  | { success: false; error: string };

export async function toggleSave(setId: string): Promise<ToggleSaveResult> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('outfit_set_saves')
    .select('id')
    .eq('user_id', user.id)
    .eq('outfit_set_id', setId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('outfit_set_saves')
      .delete()
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
    return { success: true, saved: false };
  } else {
    const { error } = await supabase
      .from('outfit_set_saves')
      .insert({ user_id: user.id, outfit_set_id: setId });
    if (error) return { success: false, error: error.message };
    return { success: true, saved: true };
  }
}
