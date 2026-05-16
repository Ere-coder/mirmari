'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  ActionResult,
  CreateOutfitItemResult,
  GenerateRotationResult,
  SeasonStatus,
} from '@/lib/types-v2';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  const { data: p } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!p?.is_admin) return { supabase: null, user: null };
  return { supabase, user };
}

// ── Outfit Items ──────────────────────────────────────────────────────────────

export async function createOutfitItem(
  seasonId: string,
  data: {
    name: string;
    category: string;
    size: string;
    color: string;
    brand: string;
    description: string;
  },
  imageUrl: string
): Promise<CreateOutfitItemResult> {
  const { supabase, user } = await verifyAdmin();
  if (!supabase || !user) return { success: false, error: 'Unauthorized' };

  const { data: item, error } = await supabase
    .from('outfit_items')
    .insert({
      admin_id:    user.id,
      season_id:   seasonId,
      name:        data.name.trim(),
      description: data.description.trim() || null,
      category:    data.category,
      size:        data.size,
      color:       data.color.trim(),
      brand:       data.brand.trim() || null,
    })
    .select('id')
    .single();

  if (error || !item) return { success: false, error: error?.message ?? 'Insert failed' };

  const { error: imgError } = await supabase
    .from('outfit_item_images')
    .insert({ item_id: item.id, url: imageUrl, is_primary: true });

  if (imgError) return { success: false, error: imgError.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true, itemId: item.id };
}

// ── Outfit Sets ───────────────────────────────────────────────────────────────

export async function createOutfitSet(
  seasonId: string,
  code: string
): Promise<ActionResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('create_outfit_set', {
    p_season_id: seasonId,
    p_code: code,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

// ── Outfit Composition ────────────────────────────────────────────────────────

export async function assignItemToOutfit(
  outfitId: string,
  itemId: string,
  seasonId: string
): Promise<ActionResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('outfit_composition')
    .insert({ outfit_id: outfitId, item_id: itemId });

  // Silently ignore duplicate assignment
  if (error && !error.message.includes('unique')) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

export async function removeItemFromOutfit(
  outfitId: string,
  itemId: string,
  seasonId: string
): Promise<ActionResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('outfit_composition')
    .delete()
    .eq('outfit_id', outfitId)
    .eq('item_id', itemId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

// ── Rotation Engine ───────────────────────────────────────────────────────────

export async function generateRotation(
  seasonId: string
): Promise<GenerateRotationResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('generate_rotation_cycle', {
    p_season_id: seasonId,
  });

  if (error) return { success: false, error: error.message };

  const result = data as GenerateRotationResult;

  if (result.success) {
    revalidatePath(`/admin/seasons/${seasonId}`);
    revalidatePath('/admin/seasons');
    revalidatePath('/admin');
  }

  return result;
}

// ── Season Status ─────────────────────────────────────────────────────────────

export async function updateSeasonStatus(
  seasonId: string,
  newStatus: SeasonStatus
): Promise<ActionResult> {
  const { supabase } = await verifyAdmin();
  if (!supabase) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('update_season_status', {
    p_season_id: seasonId,
    p_status: newStatus,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
  return { success: true };
}
