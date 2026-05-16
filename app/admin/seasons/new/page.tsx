/**
 * Admin — New season form: /admin/seasons/new
 *
 * Server Component that owns the admin guard.
 * Form submits via native HTML action → createSeason server action.
 * On success, redirects to the new season's detail page.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createSeason } from '@/app/admin/seasons/actions';

export const dynamic = 'force-dynamic';

export default async function NewSeasonPage({
  searchParams,
}: {
  searchParams: { error?: string };
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

  const errorMsg = searchParams.error
    ? decodeURIComponent(searchParams.error)
    : null;

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
        <h1 className="text-[20px] font-bold text-brand-dark">New Season</h1>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <form
          action={createSeason}
          className="px-4 py-5 flex flex-col gap-4"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >
          {errorMsg && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-600">
              {errorMsg}
            </div>
          )}

          <Field label="Season name" hint="e.g. Spring 2026">
            <input
              name="name"
              type="text"
              required
              placeholder="Spring 2026"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input name="starts_at" type="date" required className={inputCls} />
            </Field>
            <Field label="End date">
              <input name="ends_at" type="date" required className={inputCls} />
            </Field>
          </div>

          <Field
            label="Minimum users"
            hint="Rotation won't activate until this many users subscribe"
          >
            <input
              name="min_users"
              type="number"
              min={1}
              max={15}
              defaultValue={5}
              required
              className={inputCls}
            />
          </Field>

          <Field label="Expected demand">
            <select name="demand_level" required className={inputCls}>
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </Field>

          <button
            type="submit"
            className="
              w-full bg-brand-accent text-brand-bg
              rounded-2xl px-6 py-4 mt-2
              text-base font-medium
              active:opacity-80 transition-opacity
            "
          >
            Create Season
          </button>
        </form>
      </div>
    </main>
  );
}

// ── Shared field wrapper ───────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-brand-dark">
        {label}
        {hint && <span className="font-normal text-brand-dark/40 ml-1">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = `
  w-full rounded-xl border border-brand-dark/15
  bg-white px-4 py-3
  text-[14px] text-brand-dark placeholder:text-brand-dark/35
  focus:outline-none focus:ring-2 focus:ring-brand-accent/40
  transition-shadow
`;
