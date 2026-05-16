/**
 * Admin Hub — route: /admin
 *
 * v2: navigation hub linking to the key admin sections.
 * Shows current season status and quick stats.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SEASON_STATUS_LABELS } from '@/lib/types-v2';
import type { Season } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  planning:       'bg-brand-surface text-brand-dark/60',
  pending_launch: 'bg-yellow-50 text-yellow-700',
  active:         'bg-green-50 text-green-700',
  closed:         'bg-brand-dark/5 text-brand-dark/40',
};

export default async function AdminPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/wardrobe');

  // ── Fetch overview data ────────────────────────────────────────────────────
  const [
    { data: seasons },
    { count: itemCount },
    { count: setCount },
    { count: activeSubCount },
    { count: waitlistCount },
  ] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, name, status, starts_at, ends_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('outfit_items')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('outfit_sets')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waitlisted'),
  ]);

  const activeSeason = (seasons ?? []).find(s =>
    s.status === 'active' || s.status === 'pending_launch' || s.status === 'planning'
  );

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <h1 className="text-[20px] font-bold text-brand-dark">Admin</h1>
        <p className="text-[11px] text-brand-dark/35">MirMari dashboard</p>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 flex flex-col gap-5"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >

          {/* ── Current season card ─────────────────────────────────────── */}
          {activeSeason ? (
            <Link href={`/admin/seasons/${activeSeason.id}`}>
              <div className="rounded-2xl bg-brand-surface p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/40 mb-0.5">
                    Current Season
                  </p>
                  <p className="text-[16px] font-semibold text-brand-dark">
                    {(activeSeason as Season).name}
                  </p>
                  <p className="text-[12px] text-brand-dark/45 mt-0.5">
                    {new Date((activeSeason as Season).starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {new Date((activeSeason as Season).ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[(activeSeason as Season).status] ?? ''}`}>
                  {SEASON_STATUS_LABELS[(activeSeason as Season).status]}
                </span>
              </div>
            </Link>
          ) : (
            <Link href="/admin/seasons/new">
              <div className="rounded-2xl border-2 border-dashed border-brand-dark/15 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-medium text-brand-dark">No active season</p>
                  <p className="text-[12px] text-brand-dark/45 mt-0.5">Create a season to get started</p>
                </div>
                <span className="text-brand-accent text-[13px] font-semibold">New →</span>
              </div>
            </Link>
          )}

          {/* ── Stats row ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Active',     value: activeSubCount ?? 0 },
              { label: 'Waitlisted', value: waitlistCount  ?? 0 },
              { label: 'Outfit Items', value: itemCount ?? 0 },
              { label: 'Outfit Sets',  value: setCount  ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4">
                <p className="text-[24px] font-bold text-brand-dark">{value}</p>
                <p className="text-[11px] text-brand-dark/45 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Navigation cards ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 px-1">
              Manage
            </p>

            {[
              {
                href:     '/admin/seasons',
                title:    'Seasons',
                subtitle: 'Create and configure clothing seasons',
              },
              {
                href:     '/admin/users',
                title:    'Users',
                subtitle: 'Manage subscriptions and waitlist',
              },
              {
                href:     '/admin/returns',
                title:    'Returns',
                subtitle: 'Log item conditions after return',
              },
            ].map(({ href, title, subtitle }) => (
              <Link
                key={href}
                href={href}
                className="
                  rounded-2xl bg-white border border-brand-dark/[0.06]
                  p-4 flex items-center justify-between gap-3
                  active:bg-brand-surface transition-colors
                "
              >
                <div>
                  <p className="text-[15px] font-semibold text-brand-dark">{title}</p>
                  <p className="text-[12px] text-brand-dark/45 mt-0.5">{subtitle}</p>
                </div>
                <span className="text-brand-dark/30 text-lg">›</span>
              </Link>
            ))}
          </div>

          {/* ── Back to app ─────────────────────────────────────────────── */}
          <Link
            href="/wardrobe"
            className="text-center text-[13px] text-brand-dark/35 py-2 active:text-brand-dark/60"
          >
            ← Back to wardrobe
          </Link>

        </div>
      </div>
    </main>
  );
}
