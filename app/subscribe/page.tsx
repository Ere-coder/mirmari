/**
 * Subscribe — route: /subscribe
 *
 * Shown once after onboarding. Users join the waitlist here.
 * If the user already has a subscription, redirects immediately to /wardrobe.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JoinButton from './JoinButton';

export const dynamic = 'force-dynamic';

const FEATURES = [
  '3 curated outfits per week',
  'A new set every Monday',
  'Tbilisi door-to-door delivery',
  'Sunday returns — no hassle',
];

export default async function SubscribePage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/onboarding');

  // Already subscribed — skip ahead
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) redirect('/wardrobe');

  // Check current season state for contextual messaging
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('status')
    .in('status', ['planning', 'pending_launch', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const isLaunching = activeSeason?.status === 'pending_launch';
  const isActive    = activeSeason?.status === 'active';

  return (
    <main className="screen-full px-6 py-10 flex flex-col">

      {/* ── Brand header ───────────────────────────────────────────────── */}
      <div className="mb-10">
        <p className="text-xs font-medium tracking-widest uppercase text-brand-dark/35 mb-3">
          MirMari
        </p>
        <h1 className="text-3xl font-semibold text-brand-dark leading-tight mb-2">
          Wear more,<br />own less.
        </h1>
        <p className="text-sm text-brand-dark/55 leading-relaxed">
          A rotating wardrobe delivered to your door, curated each season.
        </p>
      </div>

      {/* ── Price ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[36px] font-bold text-brand-dark leading-none">150</span>
          <span className="text-[18px] font-medium text-brand-dark/60">GEL</span>
          <span className="text-sm text-brand-dark/40 ml-1">/ month</span>
        </div>
      </div>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-10">
        {FEATURES.map(f => (
          <div key={f} className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full bg-brand-accent/15 flex items-center justify-center shrink-0">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3.5 6L6.5 2" stroke="#C4688A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm text-brand-dark/75">{f}</span>
          </div>
        ))}
      </div>

      {/* ── Season status banner ────────────────────────────────────────── */}
      <div className="rounded-2xl bg-brand-surface px-5 py-4 mb-8">
        {isActive ? (
          <p className="text-sm text-brand-dark/70 text-center">
            Rotation is <strong className="text-brand-dark">active.</strong> Join now to get your first set.
          </p>
        ) : isLaunching ? (
          <p className="text-sm text-brand-dark/70 text-center">
            Season launches <strong className="text-brand-dark">soon.</strong> Join the waitlist to be first.
          </p>
        ) : (
          <p className="text-sm text-brand-dark/70 text-center">
            Season is being <strong className="text-brand-dark">curated.</strong> Join the waitlist now.
          </p>
        )}
      </div>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-end gap-3">
        <JoinButton isActive={isActive} />
        <p className="text-center text-[11px] text-brand-dark/30 leading-relaxed px-4">
          No automatic charges. Your first billing begins when
          we confirm your spot with you directly.
        </p>
      </div>

    </main>
  );
}
