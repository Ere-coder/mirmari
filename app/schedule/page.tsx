/**
 * Schedule — route: /schedule
 *
 * Phase 3: subscription status gates content.
 * Phase 5: reservation calendar and booking UI built here.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import type { SubscriptionStatus } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .single();

  const subStatus = sub?.status as SubscriptionStatus | undefined;

  return (
    <>
      <main className="screen-full pb-24">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-10 pb-6">
          <p className="text-xs font-medium tracking-widest uppercase text-brand-dark/40 mb-1">
            MirMari
          </p>
          <h1 className="text-2xl font-semibold text-brand-dark">Schedule</h1>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center flex-1 px-6 gap-6 py-8">
          <div className="w-20 h-20 flex items-center justify-center text-brand-dark/10">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="16" y1="2" x2="16" y2="6" />
            </svg>
          </div>

          {!sub && (
            <div className="text-center max-w-xs">
              <p className="text-base font-medium text-brand-dark mb-2">Subscribe first</p>
              <p className="text-sm text-brand-dark/50 leading-relaxed mb-4">
                You need an active subscription to browse and book outfit sets.
              </p>
              <Link
                href="/subscribe"
                className="
                  inline-block bg-brand-accent text-brand-bg
                  rounded-2xl px-6 py-3 text-sm font-medium
                  active:opacity-80 transition-opacity
                "
              >
                Join the waitlist
              </Link>
            </div>
          )}

          {subStatus === 'waitlisted' && (
            <div className="text-center max-w-xs">
              <p className="text-base font-medium text-brand-dark mb-2">Rotation not active yet</p>
              <p className="text-sm text-brand-dark/50 leading-relaxed">
                Booking opens once the rotation starts. You&apos;re on the list —
                we&apos;ll notify you when it&apos;s time.
              </p>
            </div>
          )}

          {subStatus === 'active' && (
            <div className="text-center max-w-xs">
              <p className="text-base font-medium text-brand-dark mb-2">No upcoming weeks yet</p>
              <p className="text-sm text-brand-dark/50 leading-relaxed">
                Once the rotation opens, you&apos;ll be able to browse available
                outfit sets and reserve your weeks here.
              </p>
            </div>
            /* Phase 5: reservation calendar replaces the above */
          )}

          {(subStatus === 'paused' || subStatus === 'cancelled') && (
            <div className="text-center max-w-xs">
              <p className="text-base font-medium text-brand-dark mb-2">Subscription inactive</p>
              <p className="text-sm text-brand-dark/50 leading-relaxed">
                Reactivate your subscription to book outfit sets.
              </p>
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </>
  );
}
