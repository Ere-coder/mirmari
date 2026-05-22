/**
 * Wardrobe — route: /wardrobe
 *
 * Public: anyone browses outfit sets without logging in.
 * Active subscribers also see their current week's booked set at the top.
 *
 * Layout per design:
 *   • Each set is a row with its code and a horizontal scroll of its 3
 *     outfit slots (Mon-Tue / Wed-Thu / Fri-Sat).
 *   • Tap a slot's thumbnail to open a fullscreen swipeable viewer of all
 *     photos belonging to that outfit.
 */
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import SetFeed, { type SetRowData } from './SetFeed';
import type { SubscriptionStatus } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

function getThisMonday(): string {
  const today = new Date();
  const dow   = today.getUTCDay();
  const diff  = dow === 0 ? -6 : 1 - dow;
  const d     = new Date(today);
  d.setUTCDate(today.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

// Outfit slot row shape returned by the supabase joins below.
interface RawOutfit {
  slot: 1 | 2 | 3;
  pieces: number | null;
  outfit_composition: {
    outfit_items: {
      outfit_item_images: { url: string; is_primary: boolean }[];
    };
  }[];
}
interface RawSet {
  id: string;
  code: string;
  outfits: RawOutfit[];
}

// Build per-outfit image arrays: primary photo of each item first, then the
// remaining photos of each item. Preserves order so the "cover" is index 0.
// pieceCount = number of distinct items (e.g. dress = 1, top+bottom = 2).
function buildSetRows(rawSets: RawSet[]): SetRowData[] {
  return rawSets.map(set => ({
    id:   set.id,
    code: set.code,
    outfits: (set.outfits ?? []).map(o => ({
      slot:       o.slot,
      images:     collectImages(o),
      // Admin-set value wins; falls back to actual item count.
      pieceCount: o.pieces ?? (o.outfit_composition ?? []).length,
    })),
  }));
}

function collectImages(outfit: RawOutfit): string[] {
  const primary: string[] = [];
  const extra:   string[] = [];
  for (const comp of outfit.outfit_composition ?? []) {
    const imgs = comp.outfit_items?.outfit_item_images ?? [];
    const p    = imgs.find(i => i.is_primary) ?? imgs[0];
    if (p?.url) primary.push(p.url);
    for (const img of imgs) {
      if (img.url && img !== p) extra.push(img.url);
    }
  }
  return [...primary, ...extra];
}

export default async function WardrobePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ── Current season ─────────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status')
    .in('status', ['planning', 'pending_launch', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // ── Outfit sets (public) ───────────────────────────────────────────────────
  let sets: SetRowData[] = [];
  if (season) {
    const { data: setsData } = await supabase
      .from('outfit_sets')
      .select(`
        id, code,
        outfits (
          slot, pieces,
          outfit_composition (
            outfit_items (
              outfit_item_images ( url, is_primary )
            )
          )
        )
      `)
      .eq('season_id', season.id)
      .eq('status', 'active')
      .order('code');

    sets = buildSetRows((setsData ?? []) as unknown as RawSet[]);
  }

  // ── Auth-gated data ────────────────────────────────────────────────────────
  let subStatus: SubscriptionStatus | undefined;
  let waitlistPosition: number | null = null;
  let currentWeekSet: SetRowData | null = null;

  if (user) {
    const thisMonday = getThisMonday();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, started_at')
      .eq('user_id', user.id)
      .single();

    subStatus = sub?.status as SubscriptionStatus | undefined;

    if (subStatus === 'waitlisted' && sub?.started_at) {
      const { count } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waitlisted')
        .lte('started_at', sub.started_at);
      waitlistPosition = count ?? null;
    }

    if (subStatus === 'active') {
      const { data: resData } = await supabase
        .from('reservations')
        .select(`
          id,
          outfit_sets (
            id, code,
            outfits (
              slot,
              outfit_composition (
                outfit_items (
                  outfit_item_images ( url, is_primary )
                )
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('week_start', thisMonday)
        .eq('status', 'confirmed')
        .single();

      const bookedSet = (resData as unknown as { outfit_sets: RawSet | null } | null)?.outfit_sets;
      if (bookedSet) currentWeekSet = buildSetRows([bookedSet])[0];
    }
  }

  return (
    <>
      <main
        className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
        style={{ height: '100dvh' }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-5 bg-brand-bg"
          style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))', paddingBottom: '1rem' }}
        >
          <p className="text-[10px] font-semibold tracking-widest uppercase text-brand-dark/35 mb-0.5">
            MirMari
          </p>
          <div className="flex items-baseline justify-between">
            <h1 className="text-[22px] font-bold text-brand-dark">Infinite Wardrobe</h1>
            {season && (
              <p className="text-[12px] text-brand-dark/35">{season.name}</p>
            )}
          </div>
        </div>

        {/* ── Status banner ────────────────────────────────────────────────── */}
        <StatusBanner user={user} subStatus={subStatus} waitlistPosition={waitlistPosition} />

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div
            className="px-4 py-4 flex flex-col gap-6"
            style={{ paddingBottom: 'calc(6rem + var(--sab, 0px))' }}
          >
            {currentWeekSet && (
              <section className="rounded-2xl bg-white border border-brand-dark/[0.06] p-3">
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/40">
                    This week
                  </p>
                  <Link
                    href="/schedule"
                    className="text-[11px] text-brand-accent active:opacity-70"
                  >
                    Schedule →
                  </Link>
                </div>
                <SetFeed sets={[currentWeekSet]} />
              </section>
            )}

            {sets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm text-brand-dark/40 text-center">
                  {season ? 'No outfit sets published yet.' : 'No active collection right now.'}
                </p>
              </div>
            ) : (
              <SetFeed sets={sets} />
            )}

            <div className="flex items-center gap-3 text-brand-dark/15 justify-center py-4">
              <span className="block w-8 h-px bg-current" />
              <span className="text-[10px] tracking-widest uppercase font-medium text-brand-dark/25">
                Wear more, own less
              </span>
              <span className="block w-8 h-px bg-current" />
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </>
  );
}

// ── Status banner ─────────────────────────────────────────────────────────────

function StatusBanner({
  user, subStatus, waitlistPosition,
}: {
  user:             { id: string } | null;
  subStatus:        SubscriptionStatus | undefined;
  waitlistPosition: number | null;
}) {
  if (!user) {
    return (
      <div className="px-4 pb-3">
        <div className="rounded-2xl bg-brand-surface px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-brand-dark/60">150 GEL/month · rotating outfits weekly</p>
          <Link href="/login" className="shrink-0 text-[12px] font-semibold text-brand-accent active:opacity-70">
            Sign in
          </Link>
        </div>
      </div>
    );
  }
  if (!subStatus) {
    return (
      <div className="px-4 pb-3">
        <div className="rounded-2xl bg-brand-surface px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-brand-dark/60">150 GEL/month · rotating outfits weekly</p>
          <Link href="/subscribe" className="shrink-0 text-[12px] font-semibold text-brand-accent active:opacity-70">
            Subscribe
          </Link>
        </div>
      </div>
    );
  }
  if (subStatus === 'waitlisted') {
    return (
      <div className="px-4 pb-3">
        <div className="rounded-2xl bg-yellow-50 border border-yellow-100 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-yellow-700">You&apos;re on the waitlist</p>
          {waitlistPosition && (
            <span className="text-[12px] font-semibold text-yellow-600">#{waitlistPosition}</span>
          )}
        </div>
      </div>
    );
  }
  if (subStatus === 'paused' || subStatus === 'cancelled') {
    return (
      <div className="px-4 pb-3">
        <div className="rounded-2xl bg-brand-surface px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-brand-dark/50">
            {subStatus === 'paused' ? 'Subscription paused' : 'Subscription cancelled'}
          </p>
          <Link href="/messages" className="shrink-0 text-[12px] font-semibold text-brand-accent active:opacity-70">
            Messages
          </Link>
        </div>
      </div>
    );
  }
  return null;
}
