/**
 * Wardrobe — route: /wardrobe
 *
 * Public: anyone browses outfit sets without logging in.
 * Auth wall fires only on action (save, subscribe).
 *
 * Active subscribers see their current week's booked outfit at the top.
 */
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import SaveButton from './SaveButton';
import type { SubscriptionStatus } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

interface SetCard {
  id:     string;
  code:   string;
  images: string[];
}

function getThisMonday(): string {
  const today = new Date();
  const dow   = today.getUTCDay();
  const diff  = dow === 0 ? -6 : 1 - dow;
  const d     = new Date(today);
  d.setUTCDate(today.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
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
  let sets: SetCard[] = [];
  if (season) {
    const { data: setsData } = await supabase
      .from('outfit_sets')
      .select(`
        id, code,
        outfits (
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

    if (setsData) {
      sets = (setsData as unknown as {
        id: string; code: string;
        outfits: { outfit_composition: { outfit_items: { outfit_item_images: { url: string; is_primary: boolean }[] } }[] }[];
      }[]).map(set => {
        const images: string[] = [];
        for (const outfit of set.outfits ?? []) {
          for (const comp of outfit.outfit_composition ?? []) {
            const imgs = comp.outfit_items?.outfit_item_images ?? [];
            const primary = imgs.find(i => i.is_primary) ?? imgs[0];
            if (primary?.url && !images.includes(primary.url)) images.push(primary.url);
            if (images.length >= 4) break;
          }
          if (images.length >= 4) break;
        }
        return { id: set.id, code: set.code, images };
      });
    }
  }

  // ── Auth-gated data ────────────────────────────────────────────────────────
  let subStatus: SubscriptionStatus | undefined;
  let waitlistPosition: number | null = null;
  let savedSetIds: string[] = [];
  let hasProfile  = false;
  let currentWeekOutfit: CurrentWeekOutfitData | null = null;

  if (user) {
    const thisMonday = getThisMonday();

    const [
      { data: sub },
      { data: saves },
      { data: profileRow },
    ] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('status, started_at')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('outfit_set_saves')
        .select('outfit_set_id')
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single(),
    ]);

    subStatus   = sub?.status as SubscriptionStatus | undefined;
    savedSetIds = (saves ?? []).map((s: { outfit_set_id: string }) => s.outfit_set_id);
    hasProfile  = !!profileRow;

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
          id, week_start,
          outfit_sets (
            id, code,
            outfits (
              id, slot, name,
              outfit_composition (
                outfit_items (
                  id, name, category,
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

      if (resData) {
        currentWeekOutfit = resData as unknown as CurrentWeekOutfitData;
      }
    }
  }

  const isActive = subStatus === 'active';

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
            className="px-4 py-4 flex flex-col gap-4"
            style={{ paddingBottom: 'calc(6rem + var(--sab, 0px))' }}
          >
            {/* ── Current week outfit (active subscribers) ─────────────── */}
            {isActive && (
              <CurrentWeekSection outfit={currentWeekOutfit} />
            )}

            {/* ── Outfit sets browse ───────────────────────────────────── */}
            {sets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm text-brand-dark/40 text-center">
                  {season ? 'No outfit sets published yet.' : 'No active season right now.'}
                </p>
              </div>
            ) : (
              <>
                {isActive && sets.length > 0 && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/30 px-1 mt-2">
                    All sets this season
                  </p>
                )}
                {sets.map(set => (
                  <OutfitSetCard
                    key={set.id}
                    set={set}
                    userId={user?.id ?? null}
                    hasProfile={hasProfile}
                    saved={savedSetIds.includes(set.id)}
                  />
                ))}
              </>
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

// ── Current week outfit ───────────────────────────────────────────────────────

interface OutfitItemData {
  id: string; name: string; category: string;
  outfit_item_images: { url: string; is_primary: boolean }[];
}
interface OutfitData {
  id: string; slot: 1 | 2 | 3; name: string | null;
  outfit_composition: { outfit_items: OutfitItemData }[];
}
interface CurrentWeekOutfitData {
  id: string; week_start: string;
  outfit_sets: { id: string; code: string; outfits: OutfitData[] };
}

const SLOT_DAYS: Record<1 | 2 | 3, string> = {
  1: 'Mon – Tue',
  2: 'Wed – Thu',
  3: 'Fri – Sat',
};

function CurrentWeekSection({ outfit }: { outfit: CurrentWeekOutfitData | null }) {
  if (!outfit) {
    return (
      <div className="rounded-2xl bg-brand-surface px-4 py-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-1">
            This week
          </p>
          <p className="text-[14px] text-brand-dark/60">No set booked yet</p>
        </div>
        <Link
          href="/schedule"
          className="shrink-0 text-[12px] font-semibold text-brand-accent active:opacity-70"
        >
          Book →
        </Link>
      </div>
    );
  }

  const set     = outfit.outfit_sets;
  const outfits = [...(set.outfits ?? [])].sort((a, b) => a.slot - b.slot);

  return (
    <div className="rounded-2xl bg-white border border-brand-dark/[0.06] overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-0.5">
            This week
          </p>
          <p className="text-[17px] font-bold text-brand-dark">Set {set.code}</p>
        </div>
        <Link
          href="/schedule"
          className="text-[12px] text-brand-dark/35 active:text-brand-dark/60"
        >
          Schedule →
        </Link>
      </div>

      {outfits.map(outfit => {
        const items = outfit.outfit_composition.map(c => c.outfit_items);
        const primaryImg = items.flatMap(item =>
          item.outfit_item_images.find(i => i.is_primary) ?? item.outfit_item_images[0] ?? null
        ).filter(Boolean)[0];

        return (
          <div key={outfit.id} className="border-t border-brand-dark/[0.04] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-dark/30 mb-2">
              {SLOT_DAYS[outfit.slot]}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {items.map(item => {
                const img = item.outfit_item_images.find(i => i.is_primary) ?? item.outfit_item_images[0];
                return (
                  <div key={item.id} className="shrink-0 w-16">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-brand-surface mb-1">
                      {img ? (
                        <img src={img.url} alt={item.name} className="w-full h-full object-cover" draggable={false} />
                      ) : (
                        <div className="w-full h-full bg-brand-dark/5" />
                      )}
                    </div>
                    <p className="text-[10px] text-brand-dark/50 truncate">{item.name}</p>
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-[12px] text-brand-dark/30">No items assigned</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
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

// ── Outfit set card ───────────────────────────────────────────────────────────

function OutfitSetCard({
  set, userId, hasProfile, saved,
}: {
  set:        SetCard;
  userId:     string | null;
  hasProfile: boolean;
  saved:      boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden bg-brand-surface relative">
      {set.images.length > 0 ? (
        <div className={`grid gap-0.5 ${set.images.length >= 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {set.images.slice(0, 4).map((url, i) => (
            <div key={i} className="aspect-square">
              <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
          ))}
        </div>
      ) : (
        <div className="aspect-video bg-brand-dark/5 flex items-center justify-center">
          <span className="text-brand-dark/20 text-sm">No photos yet</span>
        </div>
      )}
      <div className="absolute top-2.5 left-2.5">
        <span className="bg-white/85 backdrop-blur-sm text-brand-dark font-bold text-[12px] px-2.5 py-1 rounded-full">
          Set {set.code}
        </span>
      </div>
      <div className="absolute top-2 right-2">
        <SaveButton userId={userId} hasProfile={hasProfile} setId={set.id} initialSaved={saved} />
      </div>
    </div>
  );
}
