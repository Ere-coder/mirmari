'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import { createServiceClient } from '@/lib/supabase/service';
import type {
  ActionResult,
  CreateOutfitItemResult,
  GenerateRotationResult,
  SeasonStatus,
} from '@/lib/types-v2';

async function verifyAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  if (!await isAdminUser(user.id)) return { user: null };
  return { user };
}

// ── Outfit Items ──────────────────────────────────────────────────────────────

export async function createOutfitItem(
  seasonId: string,
  data: {
    name: string;
    size: string;
    alsoFits: string[];
    brand: string;
    description: string;
  },
  imageUrls: string[]
): Promise<CreateOutfitItemResult> {
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };
  if (imageUrls.length === 0) return { success: false, error: 'At least one image required' };

  const db = createServiceClient();
  const { data: item, error } = await db
    .from('outfit_items')
    .insert({
      admin_id:         user.id,
      season_id:        seasonId,
      name:             data.name.trim(),
      description:      data.description.trim() || null,
      size:             data.size,
      also_fits_sizes:  data.alsoFits,
      brand:            data.brand.trim() || null,
    })
    .select('id')
    .single();

  if (error || !item) return { success: false, error: error?.message ?? 'Insert failed' };

  const { error: imgError } = await db
    .from('outfit_item_images')
    .insert(
      imageUrls.map((url, idx) => ({
        item_id:    item.id,
        url,
        is_primary: idx === 0,
      }))
    );

  if (imgError) return { success: false, error: imgError.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true, itemId: item.id };
}

export async function renameOutfitItem(
  itemId: string,
  newName: string,
  seasonId: string
): Promise<ActionResult> {
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  const trimmed = newName.trim();
  if (!trimmed) return { success: false, error: 'Name cannot be empty' };

  const db = createServiceClient();
  const { error } = await db
    .from('outfit_items')
    .update({ name: trimmed })
    .eq('id', itemId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

export async function deleteOutfitItem(
  itemId: string,
  seasonId: string
): Promise<ActionResult> {
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  const db = createServiceClient();

  const { data: images } = await db
    .from('outfit_item_images')
    .select('url')
    .eq('item_id', itemId);

  const { error } = await db.from('outfit_items').delete().eq('id', itemId);
  if (error) return { success: false, error: error.message };

  const paths = (images ?? [])
    .map(i => {
      const marker = '/outfit-images/';
      const idx = i.url.indexOf(marker);
      return idx >= 0 ? i.url.slice(idx + marker.length) : null;
    })
    .filter((p): p is string => !!p);

  if (paths.length > 0) {
    await db.storage.from('outfit-images').remove(paths);
  }

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

// ── Outfit Sets ───────────────────────────────────────────────────────────────

export async function createOutfitSet(
  seasonId: string,
  code: string
): Promise<ActionResult> {
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  // Use the user-authed client so auth.uid() inside the RPC's is_admin()
  // check resolves to the calling admin. The service client has no user
  // context and would make the function raise "Forbidden".
  const supabase = createClient();
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
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  const db = createServiceClient();
  const { error } = await db
    .from('outfit_composition')
    .insert({ outfit_id: outfitId, item_id: itemId });

  // Silently ignore duplicate assignment
  if (error && !error.message.includes('unique')) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

export async function setOutfitPieces(
  outfitId: string,
  pieces: number | null,
  seasonId: string
): Promise<ActionResult> {
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (pieces !== null && (!Number.isInteger(pieces) || pieces < 0)) {
    return { success: false, error: 'Pieces must be a non-negative integer.' };
  }

  const db = createServiceClient();
  const { error } = await db
    .from('outfits')
    .update({ pieces })
    .eq('id', outfitId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/seasons/${seasonId}`);
  return { success: true };
}

export async function removeItemFromOutfit(
  outfitId: string,
  itemId: string,
  seasonId: string
): Promise<ActionResult> {
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  const db = createServiceClient();
  const { error } = await db
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
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createClient();
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
  const { user } = await verifyAdmin();
  if (!user) return { success: false, error: 'Unauthorized' };

  const supabase = createClient();
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
