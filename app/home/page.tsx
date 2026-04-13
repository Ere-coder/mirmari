/**
 * Home / Browse Page — route: /home
 *
 * Spec §BROWSE: Shows items that:
 *   - Do not belong to the current user
 *   - Have status = 'available'
 *
 * This Server Component:
 *   1. Verifies the session (middleware already enforces this, but we double-check).
 *   2. Fetches available items with their forward image and deep images,
 *      joined with the owner's district from profiles.
 *   3. Passes the result to SwipeBrowser (Client Component) which handles
 *      all gesture interaction and display.
 *
 * Data shape: items → profiles (via owner_id) + item_images (1:many)
 * The Supabase join returns profiles as a single object (many-to-one FK).
 *
 * NOTE: Phase 3 will add a "borrow" action to this page. The borrow button
 * will appear in the info overlay — see the PHASE 3 comment in SwipeBrowser.tsx.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SwipeBrowser from '@/components/SwipeBrowser';
import BottomNav from '@/components/BottomNav';
import CreditBar from '@/components/CreditBar';
import type { BrowseItem, ItemCategory, PrimarySize, ImageLayer } from '@/lib/types';

// force-dynamic: page shows real-time item availability; must not be cached.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch credit balance and reserved credits ──────────────────────────────
  // Spec §AVAILABLE CREDIT CHECK: effective balance = credits.balance − sum of
  // reserved_credits across all active (waiting) queue entries for this user.
  // CreditBar shows effective balance so users see what they can actually spend.
  const [{ data: credits }, { data: reservedRows }] = await Promise.all([
    supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('queue')
      .select('reserved_credits')
      .eq('user_id', user.id)
      .eq('status', 'waiting'),
  ]);

  const rawBalance    = credits?.balance ?? 0;
  const totalReserved = (reservedRows ?? []).reduce((sum, r) => sum + (r.reserved_credits ?? 0), 0);
  const balance       = rawBalance - totalReserved;  // effective balance

  // ── Fetch browse feed ──────────────────────────────────────────────────────
  // Select items not owned by the current user with status = 'available'.
  // Join: profiles (for district), item_images (for forward + deep images).
  // profiles!owner_id tells Supabase to use the owner_id FK for the join.
  const { data: rawItems, error } = await supabase
    .from('items')
    .select(`
      id,
      owner_id,
      category,
      credit_value,
      primary_size,
      numeric_size,
      fit_description,
      fit_tags,
      profiles!owner_id ( district ),
      item_images ( id, url, is_forward, layer )
    `)
    .eq('status', 'available')
    .neq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    // Log server-side; show empty state to the user rather than crashing.
    console.error('[HomePage] items fetch error:', error);
  }

  // ── Transform to BrowseItem shape ─────────────────────────────────────────
  // Supabase returns profiles as a single object for a many-to-one FK join.
  // Cast accordingly and flatten to the shape SwipeBrowser expects.
  const items: BrowseItem[] = (rawItems ?? []).map(item => {
    const profiles = item.profiles as { district: string } | { district: string }[] | null;
    const district =
      Array.isArray(profiles)
        ? (profiles[0]?.district ?? 'Tbilisi')
        : (profiles?.district ?? 'Tbilisi');

    return {
      id:              item.id,
      owner_id:        item.owner_id,
      category:        item.category as ItemCategory,
      credit_value:    item.credit_value,
      primary_size:    item.primary_size as PrimarySize,
      numeric_size:    item.numeric_size,
      fit_description: item.fit_description,
      fit_tags:        item.fit_tags,
      district,
      images: (item.item_images ?? []) as {
        id: string;
        url: string;
        is_forward: boolean;
        layer: ImageLayer;
      }[],
    };
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/*
        SwipeBrowser is fixed (position: fixed) and fills the viewport.
        It renders on top of this page's document flow.
        The BottomNav (also fixed, z-50) renders above it.
        CreditBar (z-30) sits above SwipeBrowser, below BottomNav.
      */}
      <SwipeBrowser items={items} />

      {/* Credit balance badge — top-left of the app column, links to /credits */}
      <CreditBar balance={balance} />

      {/* Bottom navigation — fixed at bottom, z-50 (above SwipeBrowser) */}
      <BottomNav />
    </>
  );
}
