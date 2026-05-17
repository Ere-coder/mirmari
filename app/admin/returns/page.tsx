/**
 * Admin — Returns: /admin/returns
 *
 * Shows past confirmed reservations that can be logged as returned.
 * Admin picks condition (good / minor_issue / damaged) and optional notes.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import LogReturnForm from './LogReturnForm';

export const dynamic = 'force-dynamic';

const CONDITION_LABELS: Record<string, { label: string; color: string }> = {
  good:        { label: 'Good',        color: 'bg-green-50 text-green-700' },
  minor_issue: { label: 'Minor issue', color: 'bg-yellow-50 text-yellow-700' },
  damaged:     { label: 'Damaged',     color: 'bg-red-50 text-red-500' },
};

export default async function ReturnsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (!await isAdminUser(user.id)) redirect('/wardrobe');

  // This Monday in UTC
  const today = new Date();
  const dow   = today.getUTCDay();
  const diff  = dow === 0 ? -6 : 1 - dow;
  const base  = new Date(today);
  base.setUTCDate(today.getUTCDate() + diff);
  const thisMonday = base.toISOString().split('T')[0];

  // Past confirmed reservations (week_start < this Monday), with user + set info
  // Left join return_events to know which are already logged
  const { data: pastRes } = await supabase
    .from('reservations')
    .select(`
      id, week_start,
      profiles ( display_name, district, delivery_zone ),
      outfit_sets ( code ),
      return_events ( id, condition, notes, returned_at )
    `)
    .eq('status', 'confirmed')
    .lt('week_start', thisMonday)
    .order('week_start', { ascending: false })
    .limit(60);

  // Current-week confirmed reservations (week_start = thisMonday)
  const { data: currentRes } = await supabase
    .from('reservations')
    .select(`
      id, week_start,
      profiles ( display_name, district, delivery_zone ),
      outfit_sets ( code ),
      return_events ( id, condition, notes, returned_at )
    `)
    .eq('status', 'confirmed')
    .eq('week_start', thisMonday)
    .order('created_at');

  type ResRow = {
    id:         string;
    week_start: string;
    profiles:   { display_name: string | null; district: string | null; delivery_zone: string | null } | null;
    outfit_sets: { code: string } | null;
    return_events: { id: string; condition: string; notes: string | null; returned_at: string }[] | null;
  };

  const past    = (pastRes    ?? []) as unknown as ResRow[];
  const current = (currentRes ?? []) as unknown as ResRow[];

  const pending  = past.filter(r => !(r.return_events?.length));
  const returned = past.filter(r =>  (r.return_events?.length));

  function userName(r: ResRow) {
    return r.profiles?.display_name ?? r.profiles?.delivery_zone ?? r.profiles?.district ?? 'Unknown';
  }

  function weekLabel(weekStart: string) {
    const d   = new Date(weekStart + 'T00:00:00Z');
    const end = new Date(d);
    end.setUTCDate(d.getUTCDate() + 6);
    const fmt = (dt: Date) => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `${fmt(d)} – ${fmt(end)}`;
  }

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <Link href="/admin" className="text-[12px] text-brand-dark/40 mb-0.5 block">← Admin</Link>
        <h1 className="text-[20px] font-bold text-brand-dark">Returns</h1>
        <p className="text-[11px] text-brand-dark/35">Log item conditions after return</p>
      </div>

      {/* Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="px-4 py-5 flex flex-col gap-6"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >

          {/* ── This week (active now) ──────────────────────────────── */}
          {current.length > 0 && (
            <section>
              <SectionLabel title="Out this week" />
              <div className="flex flex-col gap-3">
                {current.map(r => (
                  <div key={r.id} className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[14px] font-semibold text-brand-dark">{userName(r)}</p>
                      <span className="text-[12px] font-bold text-brand-dark/40">Set {r.outfit_sets?.code}</span>
                    </div>
                    <p className="text-[11px] text-brand-dark/35">{weekLabel(r.week_start)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Awaiting return log ─────────────────────────────────── */}
          {pending.length > 0 && (
            <section>
              <SectionLabel title={`Awaiting return log · ${pending.length}`} />
              <div className="flex flex-col gap-3">
                {pending.map(r => (
                  <div key={r.id} className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[14px] font-semibold text-brand-dark">{userName(r)}</p>
                      <span className="text-[12px] font-bold text-brand-dark/40">Set {r.outfit_sets?.code}</span>
                    </div>
                    <p className="text-[11px] text-brand-dark/35">{weekLabel(r.week_start)}</p>
                    <LogReturnForm reservationId={r.id} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {pending.length === 0 && current.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm text-brand-dark/40">No past reservations to log yet.</p>
            </div>
          )}

          {/* ── Logged returns ──────────────────────────────────────── */}
          {returned.length > 0 && (
            <section>
              <SectionLabel title="Logged returns" />
              <div className="flex flex-col gap-2">
                {returned.map(r => {
                  const re = r.return_events![0];
                  const cond = CONDITION_LABELS[re.condition];
                  return (
                    <div key={r.id} className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[13px] font-semibold text-brand-dark">{userName(r)}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cond.color}`}>
                          {cond.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-dark/35">
                        Set {r.outfit_sets?.code} · {weekLabel(r.week_start)}
                      </p>
                      {re.notes && (
                        <p className="text-[12px] text-brand-dark/50 mt-1">{re.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>
    </main>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
      {title}
    </p>
  );
}
