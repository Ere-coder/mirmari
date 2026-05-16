/**
 * Admin — Season detail: /admin/seasons/[id]
 *
 * Shows three sections:
 *   1. Outfit Items — item list + upload form
 *   2. Outfit Sets  — set cards + set builder
 *   3. Actions      — mark as pending_launch
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SEASON_STATUS_LABELS } from '@/lib/types-v2';
import type {
  Season,
  OutfitItemWithImages,
  OutfitSetWithOutfits,
  RotationCycle,
} from '@/lib/types-v2';
import ItemUploadForm from './ItemUploadForm';
import SetBuilderForm from './SetBuilderForm';
import SeasonActions from './SeasonActions';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  planning:       'bg-brand-surface text-brand-dark/60',
  pending_launch: 'bg-yellow-50 text-yellow-700',
  active:         'bg-green-50 text-green-700',
  closed:         'bg-brand-dark/5 text-brand-dark/40',
};

export default async function SeasonDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/wardrobe');

  const seasonId = params.id;

  // ── Parallel data fetches ──────────────────────────────────────────────────
  const [
    { data: season },
    { data: itemsData },
    { data: setsData },
    { count: waitlistCount },
    { data: rotationData },
  ] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, name, status, starts_at, ends_at, min_users, demand_level')
      .eq('id', seasonId)
      .single(),

    supabase
      .from('outfit_items')
      .select(`
        id, name, description, category, size, color, brand, status, created_at,
        outfit_item_images ( id, url, is_primary )
      `)
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false }),

    supabase
      .from('outfit_sets')
      .select(`
        id, code, status, created_at,
        outfits (
          id, slot, name,
          outfit_composition (
            id,
            outfit_items (
              id, name, category, size, color, brand,
              outfit_item_images ( id, url, is_primary )
            )
          )
        )
      `)
      .eq('season_id', seasonId)
      .order('code'),

    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waitlisted'),

    supabase
      .from('rotation_cycles')
      .select('id, set_count, cycle_length_weeks, max_concurrent, users_promoted, published_at')
      .eq('season_id', seasonId)
      .single(),
  ]);

  if (!season) redirect('/admin/seasons');

  const items    = (itemsData   ?? []) as unknown as OutfitItemWithImages[];
  const sets     = (setsData    ?? []) as unknown as OutfitSetWithOutfits[];
  const rotation = rotationData as RotationCycle | null;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalItems   = items.length;
  const totalSets    = sets.length;
  const configuredSets = sets.filter(s =>
    s.outfits?.every(o => (o.outfit_composition ?? []).length > 0)
  ).length;

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
        <Link href="/admin/seasons" className="text-[12px] text-brand-dark/40 mb-0.5 block">
          ← Seasons
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[20px] font-bold text-brand-dark truncate">
            {(season as Season).name}
          </h1>
          <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[(season as Season).status] ?? ''}`}>
            {SEASON_STATUS_LABELS[(season as Season).status]}
          </span>
        </div>
        <p className="text-[12px] text-brand-dark/45 mt-0.5">
          {new Date((season as Season).starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          {' – '}
          {new Date((season as Season).ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          {' · min '}
          {(season as Season).min_users} users
        </p>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="px-4 py-5 flex flex-col gap-6"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >

          {/* ── Stats bar ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Items',      value: totalItems },
              { label: 'Sets',       value: totalSets },
              { label: 'Configured', value: configuredSets },
              { label: 'Waitlisted', value: waitlistCount ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-white border border-brand-dark/[0.06] p-3 text-center">
                <p className="text-[20px] font-bold text-brand-dark">{value}</p>
                <p className="text-[10px] text-brand-dark/40 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Outfit Items ─────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Outfit Items" count={totalItems} />
            <ItemUploadForm seasonId={seasonId} existingItems={items} />
          </section>

          {/* ── Outfit Sets ──────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Outfit Sets" count={totalSets} />
            <SetBuilderForm
              seasonId={seasonId}
              seasonItems={items}
              sets={sets}
            />
          </section>

          {/* ── Rotation Info (active seasons only) ─────────────────────── */}
          {(season as Season).status === 'active' && rotation && (
            <section>
              <SectionHeader title="Rotation" />
              <div className="rounded-2xl bg-green-50 border border-green-200 p-4 flex flex-col gap-2">
                <p className="text-[13px] font-semibold text-green-700">Rotation active</p>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[
                    { label: 'Sets',     value: rotation.set_count },
                    { label: 'Active',   value: rotation.users_promoted },
                    { label: 'Wk cycle', value: rotation.cycle_length_weeks },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-white/70 p-2.5 text-center">
                      <p className="text-[18px] font-bold text-green-800">{value}</p>
                      <p className="text-[10px] text-green-600 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-green-500 mt-1">
                  Published {new Date(rotation.published_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              </div>
            </section>
          )}

          {/* ── Season Actions ────────────────────────────────────────────── */}
          {(season as Season).status !== 'active' && (season as Season).status !== 'closed' && (
            <section>
              <SectionHeader title="Actions" />
              <SeasonActions
                seasonId={seasonId}
                currentStatus={(season as Season).status}
                totalSets={totalSets}
                configuredSets={configuredSets}
                minUsers={(season as Season).min_users}
                waitlistCount={waitlistCount ?? 0}
              />
            </section>
          )}

        </div>
      </div>
    </main>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40">
        {title}
      </h2>
      {count !== undefined && (
        <span className="text-[11px] text-brand-dark/30">{count}</span>
      )}
    </div>
  );
}
