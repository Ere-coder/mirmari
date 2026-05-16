/**
 * Profile — route: /profile/[id]
 *
 * v2: shows the user's own profile info, subscription status, and sign-out.
 * Phase 8: outfit history added here.
 */
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import SignOutButton from '@/components/SignOutButton';
import type { SubscriptionStatus } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

const SUB_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  waitlisted: 'Waitlisted',
  active:     'Active',
  paused:     'Paused',
  cancelled:  'Cancelled',
};

const SUB_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  waitlisted: 'bg-yellow-50 text-yellow-700',
  active:     'bg-green-50 text-green-700',
  paused:     'bg-brand-surface text-brand-dark/50',
  cancelled:  'bg-brand-dark/5 text-brand-dark/40',
};

export default async function ProfileDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // Only allow viewing your own profile for now (Phase 8 can expand this)
  if (params.id !== user.id) redirect(`/profile/${user.id}`);

  const [
    { data: profile, error: profileError },
    { data: sub },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, delivery_zone, district, size_preference, is_admin')
      .eq('id', params.id)
      .single(),
    supabase
      .from('subscriptions')
      .select('status, started_at')
      .eq('user_id', params.id)
      .single(),
  ]);

  if (profileError || !profile) notFound();

  const p = profile as {
    id: string;
    display_name: string | null;
    delivery_zone: string | null;
    district: string | null;
    size_preference: string | null;
    is_admin: boolean;
  };

  const displayName  = p.display_name ?? user.email ?? 'You';
  const deliveryZone = p.delivery_zone ?? p.district ?? '—';
  const subStatus    = sub?.status as SubscriptionStatus | undefined;

  return (
    <>
      <main
        className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
        style={{ height: '100dvh' }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
          style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
        >
          <h1 className="text-[20px] font-bold text-brand-dark">Profile</h1>
          <p className="text-[11px] text-brand-dark/35">{user.email}</p>
        </div>

        {/* ── Scrollable content ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div
            className="px-4 py-5 flex flex-col gap-4"
            style={{ paddingBottom: 'calc(6rem + var(--sab, 0px))' }}
          >

            {/* ── Avatar + name ─────────────────────────────────────────── */}
            <div className="flex items-center gap-4 py-2">
              <div className="w-14 h-14 rounded-full bg-brand-surface flex items-center justify-center shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className="text-brand-dark/30">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
                </svg>
              </div>
              <div>
                <p className="text-[17px] font-semibold text-brand-dark leading-tight">{displayName}</p>
                {p.is_admin && (
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
                    Admin
                  </span>
                )}
              </div>
            </div>

            {/* ── Subscription card ─────────────────────────────────────── */}
            <div className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/40 mb-0.5">
                  Subscription
                </p>
                {sub?.started_at && (
                  <p className="text-[12px] text-brand-dark/40 mt-0.5">
                    Since {new Date(sub.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {!sub && (
                  <p className="text-[14px] font-medium text-brand-dark/40">No subscription</p>
                )}
              </div>
              {subStatus && (
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${SUB_STATUS_COLORS[subStatus]}`}>
                  {SUB_STATUS_LABELS[subStatus]}
                </span>
              )}
            </div>

            {/* ── Details ───────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex flex-col gap-3">
              <InfoRow label="Delivery zone" value={deliveryZone} />
              <InfoRow label="Size preference" value={p.size_preference ?? '—'} />
            </div>

            {/* ── Admin link ────────────────────────────────────────────── */}
            {p.is_admin && (
              <a
                href="/admin"
                className="
                  rounded-2xl bg-white border border-brand-dark/[0.06]
                  p-4 flex items-center justify-between gap-3
                  active:bg-brand-surface transition-colors
                "
              >
                <div>
                  <p className="text-[15px] font-semibold text-brand-dark">Admin dashboard</p>
                  <p className="text-[12px] text-brand-dark/45 mt-0.5">Manage seasons, inventory and users</p>
                </div>
                <span className="text-brand-dark/30 text-lg">›</span>
              </a>
            )}

            {/* ── Sign out ──────────────────────────────────────────────── */}
            <div className="pt-2">
              <SignOutButton />
            </div>

          </div>
        </div>
      </main>

      <BottomNav />
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] text-brand-dark/45">{label}</p>
      <p className="text-[13px] font-medium text-brand-dark">{value}</p>
    </div>
  );
}
