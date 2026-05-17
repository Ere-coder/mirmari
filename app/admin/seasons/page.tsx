/**
 * Admin — Seasons list: /admin/seasons
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import { SEASON_STATUS_LABELS } from '@/lib/types-v2';
import type { Season } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  planning:       'bg-brand-surface text-brand-dark/60',
  pending_launch: 'bg-yellow-50 text-yellow-700',
  active:         'bg-green-50 text-green-700',
  closed:         'bg-brand-dark/5 text-brand-dark/40',
};

export default async function SeasonsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (!await isAdminUser(user.id)) redirect('/wardrobe');

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, status, starts_at, ends_at, min_users, demand_level')
    .order('created_at', { ascending: false });

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <div className="flex-1">
          <Link href="/admin" className="text-[12px] text-brand-dark/40 mb-0.5 block">← Admin</Link>
          <h1 className="text-[20px] font-bold text-brand-dark">Seasons</h1>
        </div>
        <Link
          href="/admin/seasons/new"
          className="
            bg-brand-accent text-brand-bg
            text-[13px] font-semibold
            px-3.5 py-2 rounded-xl
            active:opacity-80
          "
        >
          + New
        </Link>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 flex flex-col gap-3"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >
          {(seasons ?? []).length === 0 ? (
            <div className="rounded-2xl bg-brand-surface px-5 py-8 text-center">
              <p className="text-[14px] text-brand-dark/50 mb-3">No seasons yet.</p>
              <Link
                href="/admin/seasons/new"
                className="text-[13px] font-semibold text-brand-accent"
              >
                Create the first season →
              </Link>
            </div>
          ) : (
            (seasons as Season[]).map(season => (
              <Link
                key={season.id}
                href={`/admin/seasons/${season.id}`}
                className="
                  rounded-2xl bg-white border border-brand-dark/[0.06]
                  p-4 flex items-center justify-between gap-3
                  active:bg-brand-surface transition-colors
                "
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-brand-dark truncate">{season.name}</p>
                  <p className="text-[12px] text-brand-dark/45 mt-0.5">
                    {new Date(season.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {new Date(season.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}min {season.min_users} users
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[season.status] ?? ''}`}>
                  {SEASON_STATUS_LABELS[season.status]}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
