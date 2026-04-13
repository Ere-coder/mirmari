/**
 * Admin Dashboard — route: /admin
 *
 * Spec §ADMIN DASHBOARD:
 * - Requires profiles.is_admin = true. Non-admins are redirected to /home.
 * - Sections:
 *     1. Damage Reports — all reports ordered by created_at DESC.
 *        Each rendered as DamageReportCard (pending) or resolved summary row.
 *     2. Active Borrows — all borrows with status IN ('pending', 'active'),
 *        showing item category, borrower, and borrow date.
 *
 * Server Component: all data fetched server-side; DamageReportCard is a client
 * component for the classify actions.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import DamageReportCard from './DamageReportCard';
import { CATEGORY_LABELS, type ItemCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Admin guard ────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/home');

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const [
    { data: reports },
    { data: activeBorrows },
  ] = await Promise.all([
    // All damage reports with item + reporter info
    supabase
      .from('damage_reports')
      .select(`
        id,
        borrow_id,
        item_id,
        reporter_id,
        description,
        status,
        admin_note,
        created_at,
        resolved_at,
        items ( category ),
        profiles!reporter_id ( display_name, district )
      `)
      .order('created_at', { ascending: false }),

    // Active borrows (pending + active)
    supabase
      .from('borrows')
      .select(`
        id,
        item_id,
        borrower_id,
        status,
        created_at,
        items ( category ),
        profiles!borrower_id ( display_name, district )
      `)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false }),
  ]);

  // ── Build lookup for admin chat IDs (to link from damage report cards) ────
  const reportIds = (reports ?? []).map(r => r.id);
  let adminChatByReportBorrow: Record<string, string> = {};

  if (reportIds.length > 0) {
    const borrowIds = (reports ?? []).map(r => r.borrow_id);
    const { data: adminChats } = await supabase
      .from('chats')
      .select('borrow_id, id')
      .in('borrow_id', borrowIds)
      .eq('chat_type', 'admin');

    adminChatByReportBorrow = Object.fromEntries(
      (adminChats ?? []).map(c => [c.borrow_id, c.id])
    );
  }

  // ── Fetch condition images for each damage report ──────────────────────────
  // These were inserted by submit_damage_report (layer='condition').
  const itemIdsWithReports = Array.from(new Set((reports ?? []).map(r => r.item_id)));
  let conditionImagesByItem: Record<string, string[]> = {};

  if (itemIdsWithReports.length > 0) {
    const { data: condImgs } = await supabase
      .from('item_images')
      .select('item_id, url')
      .in('item_id', itemIdsWithReports)
      .eq('layer', 'condition');

    for (const img of (condImgs ?? [])) {
      if (!conditionImagesByItem[img.item_id]) conditionImagesByItem[img.item_id] = [];
      conditionImagesByItem[img.item_id].push(img.url);
    }
  }

  const pendingReports   = (reports ?? []).filter(r => r.status === 'submitted' || r.status === 'under_review');
  const resolvedReports  = (reports ?? []).filter(r => r.status === 'repairable' || r.status === 'irreversible');

  return (
    <main
      className="
        fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app
        bg-brand-bg flex flex-col
      "
      style={{ height: '100dvh' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="
          flex-shrink-0 flex items-center gap-3 px-5
          bg-brand-bg border-b border-brand-dark/[0.06]
        "
        style={{
          paddingTop:    'calc(1rem + var(--sat, 0px))',
          paddingBottom: '1rem',
        }}
      >
        <div className="flex-1">
          <h1 className="text-[20px] font-bold text-brand-dark">Admin</h1>
          <p className="text-[11px] text-brand-dark/35">MirMari dashboard</p>
        </div>
        <Link
          href="/home"
          className="text-[13px] text-brand-dark/50 active:text-brand-dark/80"
        >
          ← Home
        </Link>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="px-4 py-5 flex flex-col gap-8"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >

          {/* ── Damage Reports section ──────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40">
                Damage Reports
              </h2>
              {pendingReports.length > 0 && (
                <span className="text-[11px] font-semibold text-red-500">
                  {pendingReports.length} pending
                </span>
              )}
            </div>

            {(reports ?? []).length === 0 ? (
              <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
                <p className="text-[13px] text-brand-dark/40">No damage reports yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Pending reports first */}
                {pendingReports.map(report => {
                  const item    = (report.items as unknown as { category: string } | null);
                  // Phase 8 §USER DISPLAY NAMES
                  const reporter = (report.profiles as unknown as { display_name: string | null; district: string } | null);
                  const category = item?.category
                    ? CATEGORY_LABELS[item.category as ItemCategory] ?? item.category
                    : 'Item';
                  const images = conditionImagesByItem[report.item_id] ?? [];
                  const chatId = adminChatByReportBorrow[report.borrow_id] ?? null;

                  return (
                    <DamageReportCard
                      key={report.id}
                      reportId={report.id}
                      adminId={user.id}
                      description={report.description}
                      status={report.status}
                      adminNote={report.admin_note}
                      itemCategory={category}
                      reporterName={reporter?.display_name ?? reporter?.district ?? 'Unknown'}
                      reporterDistrict={reporter?.district ?? 'Tbilisi'}
                      imageUrls={images}
                      createdAt={report.created_at ?? ''}
                      adminChatId={chatId}
                    />
                  );
                })}

                {/* Resolved reports (read-only) */}
                {resolvedReports.length > 0 && (
                  <>
                    <p className="text-[11px] text-brand-dark/30 px-1 mt-1">Resolved</p>
                    {resolvedReports.map(report => {
                      const item     = (report.items as unknown as { category: string } | null);
                      // Phase 8 §USER DISPLAY NAMES
                  const reporter = (report.profiles as unknown as { display_name: string | null; district: string } | null);
                      const category = item?.category
                        ? CATEGORY_LABELS[item.category as ItemCategory] ?? item.category
                        : 'Item';
                      const images = conditionImagesByItem[report.item_id] ?? [];
                      const chatId = adminChatByReportBorrow[report.borrow_id] ?? null;

                      return (
                        <DamageReportCard
                          key={report.id}
                          reportId={report.id}
                          adminId={user.id}
                          description={report.description}
                          status={report.status}
                          adminNote={report.admin_note}
                          itemCategory={category}
                          reporterName={reporter?.display_name ?? reporter?.district ?? 'Unknown'}
                          reporterDistrict={reporter?.district ?? 'Tbilisi'}
                          imageUrls={images}
                          createdAt={report.created_at ?? ''}
                          adminChatId={chatId}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── Active Borrows section ──────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40">
                Active Borrows
              </h2>
              <span className="text-[11px] text-brand-dark/35">
                {(activeBorrows ?? []).length} total
              </span>
            </div>

            {(activeBorrows ?? []).length === 0 ? (
              <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
                <p className="text-[13px] text-brand-dark/40">No active borrows.</p>
              </div>
            ) : (
              <div className="bg-brand-surface rounded-2xl overflow-hidden">
                {(activeBorrows ?? []).map((borrow, i) => {
                  const item      = (borrow.items as unknown as { category: string } | null);
                  // Phase 8 §USER DISPLAY NAMES
                  const borrower  = (borrow.profiles as unknown as { display_name: string | null; district: string } | null);
                  const category  = item?.category
                    ? CATEGORY_LABELS[item.category as ItemCategory] ?? item.category
                    : 'Item';

                  return (
                    <div
                      key={borrow.id}
                      className={`
                        px-5 py-3.5 flex items-center justify-between gap-3
                        ${i < (activeBorrows ?? []).length - 1 ? 'border-b border-brand-dark/5' : ''}
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-brand-dark truncate">
                          {category}
                        </p>
                        <p className="text-[12px] text-brand-dark/45 truncate mt-0.5">
                          {/* Phase 8 §USER DISPLAY NAMES: fall back to district */}
                          {borrower?.display_name ?? borrower?.district ?? 'Unknown'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`
                          text-[11px] font-medium px-2 py-0.5 rounded-full
                          ${borrow.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'}
                        `}>
                          {borrow.status}
                        </span>
                        <p className="text-[11px] text-brand-dark/30 mt-1">
                          {new Date(borrow.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short',
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}
