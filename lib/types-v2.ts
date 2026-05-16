/**
 * MirMari v2 TypeScript types.
 *
 * Kept separate from lib/types.ts (v1) during the transition period.
 * lib/types.ts is removed in Phase 9 cleanup along with all v1 tables.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export type SeasonStatus = 'planning' | 'pending_launch' | 'active' | 'closed';
export type DemandLevel  = 'low' | 'medium' | 'high';
export type SetStatus    = 'active' | 'inactive';

export type OutfitItemCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'accessory';
export type OutfitItemStatus   = 'active' | 'retired';

export type ReservationStatus = 'confirmed' | 'cancelled';
export type ReturnCondition   = 'good' | 'minor_issue' | 'damaged';

export type SubscriptionStatus = 'waitlisted' | 'active' | 'paused' | 'cancelled';

// ── Display labels ────────────────────────────────────────────────────────────

export const OUTFIT_ITEM_CATEGORY_LABELS: Record<OutfitItemCategory, string> = {
  top:       'Top',
  bottom:    'Bottom',
  dress:     'Dress',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  planning:       'Planning',
  pending_launch: 'Ready to Launch',
  active:         'Active',
  closed:         'Closed',
};

export const SLOT_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Monday – Tuesday',
  2: 'Wednesday – Thursday',
  3: 'Friday – Saturday',
};

export const ALL_SET_CODES = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'] as const;
export type SetCode = (typeof ALL_SET_CODES)[number];

// ── Base table row shapes ─────────────────────────────────────────────────────

export interface Season {
  id:           string;
  name:         string;
  starts_at:    string;
  ends_at:      string;
  min_users:    number;
  demand_level: DemandLevel;
  status:       SeasonStatus;
  created_at:   string;
}

export interface OutfitItem {
  id:          string;
  admin_id:    string;
  season_id:   string;
  name:        string;
  description: string | null;
  category:    OutfitItemCategory;
  size:        string;
  color:       string;
  brand:       string | null;
  status:      OutfitItemStatus;
  created_at:  string;
}

export interface OutfitItemImage {
  id:         string;
  item_id:    string;
  url:        string;
  is_primary: boolean;
  created_at: string;
}

export interface OutfitSet {
  id:         string;
  code:       string;
  season_id:  string;
  status:     SetStatus;
  created_at: string;
}

export interface Outfit {
  id:     string;
  set_id: string;
  slot:   1 | 2 | 3;
  name:   string | null;
}

export interface OutfitComposition {
  id:        string;
  outfit_id: string;
  item_id:   string;
}

// ── Nested shapes (for admin UI) ──────────────────────────────────────────────

export interface OutfitItemWithImages extends OutfitItem {
  outfit_item_images: OutfitItemImage[];
}

/** outfit_composition row as returned by Supabase nested select */
export interface CompositionWithItem {
  id:          string;
  outfit_items: OutfitItemWithImages;  // single object, not array (many-to-one FK)
}

export interface OutfitWithItems extends Outfit {
  outfit_composition: CompositionWithItem[];
}

export interface OutfitSetWithOutfits extends OutfitSet {
  outfits: OutfitWithItems[];
}

// ── Server action result types ─────────────────────────────────────────────────

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

export type CreateSeasonResult =
  | { success: true; seasonId: string }
  | { success: false; error: string };

export type CreateOutfitItemResult =
  | { success: true; itemId: string }
  | { success: false; error: string };

// ── Rotation Engine ────────────────────────────────────────────────────────────

export interface RotationCycle {
  id:                  string;
  season_id:           string;
  set_count:           number;
  cycle_length_weeks:  number;
  max_concurrent:      number;
  users_promoted:      number;
  published_at:        string;
  created_at:          string;
}

export interface SeasonLaunchValidation {
  success:         true;
  set_count:       number;
  configured_sets: number;
  waitlist_count:  number;
  min_users:       number;
  sets_ok:         boolean;
  users_ok:        boolean;
}

export type GenerateRotationResult =
  | { success: true; cycle_id: string; set_count: number; users_promoted: number }
  | { success: false; error: string };
