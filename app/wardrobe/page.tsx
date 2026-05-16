/**
 * Wardrobe — route: /wardrobe
 *
 * v2 main entry point. Content branches on subscription status:
 *   no subscription → prompt to subscribe
 *   waitlisted      → waiting state with position context
 *   active          → wardrobe content (Phase 5 builds this out)
 *   paused/cancelled→ reactivation prompt
 *
 * Phase 5: current week's outfit set rendered in the 'active' branch.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import type { SubscriptionStatus } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

export default async function WardrobePage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch subscription ─────────────────────────────────────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, status, started_at')
    .eq('user_id', user.id)
    .single();

  // ── Fetch active season (for context) ─────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status')
    .in('status', ['planning', 'pending_launch', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const subStatus = sub?.status as SubscriptionStatus | undefined;

  // ── Waitlist position (for waitlisted users) ───────────────────────────────
  let waitlistPosition: number | null = null;
  if (subStatus === 'waitlisted' && sub?.started_at) {
    const { count } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waitlisted')
      .lte('started_at', sub.started_at);
    waitlistPosition = count ?? null;
  }

  return (
    <>
      <main className="screen-full pb-24">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-10 pb-6">
          <p className="text-xs font-medium tracking-widest uppercase text-brand-dark/40 mb-1">
            MirMari
          </p>
          <h1 className="text-2xl font-semibold text-brand-dark">Your Wardrobe</h1>
        </div>

        {/* ── Content branches ────────────────────────────────────────── */}
        {!sub && <NoSubscription />}
        {subStatus === 'waitlisted' && <Waitlisted position={waitlistPosition} seasonStatus={season?.status} />}
        {subStatus === 'active' && <ActiveWardrobe seasonName={season?.name} />}
        {(subStatus === 'paused' || subStatus === 'cancelled') && <Inactive status={subStatus} />}
      </main>

      <BottomNav />
    </>
  );
}

// ── Branch components ─────────────────────────────────────────────────────────

function NoSubscription() {
  return (
    <div className="flex flex-col items-center px-6 gap-6 py-8">
      <HangerIcon />
      <div className="text-center max-w-xs">
        <p className="text-base font-medium text-brand-dark mb-2">Subscribe to get started</p>
        <p className="text-sm text-brand-dark/50 leading-relaxed">
          Join the waitlist to access MirMari&apos;s rotating wardrobe.
        </p>
      </div>
      <Link
        href="/subscribe"
        className="
          bg-brand-accent text-brand-bg
          rounded-2xl px-8 py-3.5
          text-sm font-medium
          active:opacity-80 transition-opacity
        "
      >
        View plans
      </Link>
      <Tagline />
    </div>
  );
}

function Waitlisted({ position, seasonStatus }: { position: number | null; seasonStatus?: string }) {
  return (
    <div className="flex flex-col items-center px-6 gap-6 py-8">
      <HangerIcon />
      <div className="text-center max-w-xs">
        <p className="text-base font-medium text-brand-dark mb-2">You&apos;re on the list</p>
        {position && (
          <p className="text-sm font-semibold text-brand-accent mb-2">
            #{position} in the waitlist
          </p>
        )}
        <p className="text-sm text-brand-dark/50 leading-relaxed">
          {seasonStatus === 'active'
            ? 'The rotation is active. We\'ll confirm your spot shortly.'
            : 'We\'ll notify you as soon as the rotation opens.'}
        </p>
      </div>
      <Tagline />
    </div>
  );
}

function ActiveWardrobe({ seasonName }: { seasonName?: string }) {
  return (
    <div className="flex flex-col items-center px-6 gap-6 py-8">
      <HangerIcon />
      <div className="text-center max-w-xs">
        <p className="text-base font-medium text-brand-dark mb-2">
          {seasonName ?? 'Your wardrobe is ready'}
        </p>
        <p className="text-sm text-brand-dark/50 leading-relaxed">
          Your outfit sets will appear here. Reserve weeks in the Schedule tab.
        </p>
      </div>
      {/* Phase 5: current week's outfit set rendered here */}
      <Tagline />
    </div>
  );
}

function Inactive({ status }: { status: 'paused' | 'cancelled' }) {
  return (
    <div className="flex flex-col items-center px-6 gap-6 py-8">
      <HangerIcon />
      <div className="text-center max-w-xs">
        <p className="text-base font-medium text-brand-dark mb-2">
          {status === 'paused' ? 'Subscription paused' : 'Subscription cancelled'}
        </p>
        <p className="text-sm text-brand-dark/50 leading-relaxed">
          Contact us via Messages to reactivate your wardrobe.
        </p>
      </div>
      <Link
        href="/messages"
        className="text-sm font-medium text-brand-accent active:opacity-70"
      >
        Open Messages →
      </Link>
    </div>
  );
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function HangerIcon() {
  return (
    <div className="w-20 h-20 flex items-center justify-center text-brand-dark/10">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1.5" />
        <path d="M12 6.5C9.5 8 4 11.5 4 17h16c0-5.5-5.5-9-8-10.5z" />
      </svg>
    </div>
  );
}

function Tagline() {
  return (
    <div className="flex items-center gap-3 text-brand-dark/15">
      <span className="block w-8 h-px bg-current" />
      <span className="text-[10px] tracking-widest uppercase font-medium text-brand-dark/25">
        Wear more, own less
      </span>
      <span className="block w-8 h-px bg-current" />
    </div>
  );
}
