/**
 * Schedule — route: /schedule
 *
 * Phase 5: set-first booking.
 * Cycle length is admin-defined via rotation_cycles.cycle_length_weeks
 * (equals number of outfit sets: 12, 13, 14 or 15).
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import BookingCalendar from './BookingCalendar';
import type { SubscriptionStatus } from '@/lib/types-v2';
import type { SetSlot } from './BookingCalendar';

export const dynamic = 'force-dynamic';

function getThisMonday(): string {
  const today = new Date();
  const dow   = today.getUTCDay();
  const diff  = dow === 0 ? -6 : 1 - dow;
  const d     = new Date(today);
  d.setUTCDate(today.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function getUpcomingMondays(cycleLen: number): string[] {
  const base  = new Date(getThisMonday() + 'T00:00:00Z');
  const weeks: string[] = [];
  for (let i = 0; i < cycleLen; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i * 7);
    weeks.push(d.toISOString().split('T')[0]);
  }
  return weeks;
}

export default async function SchedulePage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/onboarding');

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .single();

  const subStatus = sub?.status as SubscriptionStatus | undefined;

  if (subStatus !== 'active') {
    return (
      <>
        <main
          className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
          style={{ height: '100dvh' }}
        >
          <ScheduleHeader />
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
            <CalendarIcon />
            {!sub && (
              <StatusBlock title="Subscribe first" body="You need an active subscription to book outfit sets.">
                <Link
                  href="/subscribe"
                  className="inline-block bg-brand-accent text-brand-bg rounded-2xl px-6 py-3 text-sm font-medium active:opacity-80"
                >
                  Join the waitlist
                </Link>
              </StatusBlock>
            )}
            {subStatus === 'waitlisted' && (
              <StatusBlock
                title="Rotation not open yet"
                body="Booking opens once the rotation starts. You're on the list — we'll notify you."
              />
            )}
            {(subStatus === 'paused' || subStatus === 'cancelled') && (
              <StatusBlock title="Subscription inactive" body="Reactivate your subscription to book outfit sets.">
                <Link href="/messages" className="text-sm font-medium text-brand-accent active:opacity-70">
                  Open Messages →
                </Link>
              </StatusBlock>
            )}
          </div>
        </main>
        <BottomNav />
      </>
    );
  }

  // ── Active subscriber: fetch booking data ──────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .single();

  if (!season) {
    return (
      <>
        <main
          className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
          style={{ height: '100dvh' }}
        >
          <ScheduleHeader />
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <StatusBlock title="Season ended" body="No active season at the moment." />
          </div>
        </main>
        <BottomNav />
      </>
    );
  }

  const [
    { data: cycleData },
    { data: setsData },
    { data: myReservations },
    { data: allReservations },
  ] = await Promise.all([
    supabase
      .from('rotation_cycles')
      .select('cycle_length_weeks')
      .eq('season_id', season.id)
      .single(),

    supabase
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
      .order('code'),

    supabase
      .from('reservations')
      .select('id, outfit_set_id, week_start')
      .eq('user_id', user.id)
      .eq('status', 'confirmed'),

    supabase
      .from('reservations')
      .select('outfit_set_id, week_start')
      .eq('status', 'confirmed'),
  ]);

  const cycleLen = cycleData?.cycle_length_weeks ?? 8;
  const weeks    = getUpcomingMondays(cycleLen);

  // ── Index reservations ─────────────────────────────────────────────────────
  type MyRes = { id: string; outfit_set_id: string; week_start: string };
  const myResBySetId = new Map<string, MyRes>(
    ((myReservations ?? []) as MyRes[]).map(r => [r.outfit_set_id, r])
  );
  const myBookedWeeks = new Set(
    ((myReservations ?? []) as MyRes[]).map(r => r.week_start)
  );

  // Sets taken per week (by any user)
  const takenByWeek = new Map<string, Set<string>>();
  for (const r of (allReservations ?? []) as { outfit_set_id: string; week_start: string }[]) {
    if (!takenByWeek.has(r.week_start)) takenByWeek.set(r.week_start, new Set());
    takenByWeek.get(r.week_start)!.add(r.outfit_set_id);
  }

  // ── Build set slots ────────────────────────────────────────────────────────
  const sets: SetSlot[] = ((setsData ?? []) as unknown as {
    id: string; code: string;
    outfits: { outfit_composition: { outfit_items: { outfit_item_images: { url: string; is_primary: boolean }[] } }[] }[];
  }[]).map(set => {
    // Build image list
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

    // User's booking for this set
    const myRes = myResBySetId.get(set.id) ?? null;

    // Next available week for this set
    let nextAvailableWeek: string | null = null;
    if (!myRes) {
      for (const week of weeks) {
        const taken = takenByWeek.get(week) ?? new Set<string>();
        if (!taken.has(set.id) && !myBookedWeeks.has(week)) {
          nextAvailableWeek = week;
          break;
        }
      }
    }

    return {
      id:   set.id,
      code: set.code,
      images,
      reservation: myRes ? { id: myRes.id, weekStart: myRes.week_start } : null,
      nextAvailableWeek,
    };
  });

  return (
    <>
      <main
        className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
        style={{ height: '100dvh' }}
      >
        <ScheduleHeader seasonName={season.name} />
        <div className="flex-1 overflow-y-auto">
          <div className="py-4">
            <BookingCalendar sets={sets} />
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ScheduleHeader({ seasonName }: { seasonName?: string }) {
  return (
    <div
      className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
      style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))', paddingBottom: '1rem' }}
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-brand-dark/35 mb-0.5">
        MirMari
      </p>
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold text-brand-dark">Schedule</h1>
        {seasonName && <p className="text-[12px] text-brand-dark/35">{seasonName}</p>}
      </div>
    </div>
  );
}

function StatusBlock({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="text-center max-w-xs flex flex-col items-center gap-4">
      <div>
        <p className="text-base font-medium text-brand-dark mb-2">{title}</p>
        <p className="text-sm text-brand-dark/50 leading-relaxed">{body}</p>
      </div>
      {children}
    </div>
  );
}

function CalendarIcon() {
  return (
    <div className="w-16 h-16 flex items-center justify-center text-brand-dark/10">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="16" y1="2" x2="16" y2="6" />
      </svg>
    </div>
  );
}
