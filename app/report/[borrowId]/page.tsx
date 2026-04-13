/**
 * Report Damage Page — route: /report/[borrowId]
 *
 * Spec §DAMAGE REPORTING SYSTEM:
 * - Available to confirmed borrowers (borrow.status = 'active') only.
 * - Server validates access and fetches item context.
 * - Redirects to /home if user is not the borrower or borrow is not active.
 * - Shows context header (item category) and renders ReportForm client component.
 *
 * After a successful submission, submit_damage_report creates an admin support
 * chat and ReportForm navigates to /chat/[adminChatId].
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ReportForm from './ReportForm';
import { CATEGORY_LABELS, type ItemCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { borrowId: string };
}

export default async function ReportPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch borrow and verify access ────────────────────────────────────────
  const { data: borrow, error: borrowError } = await supabase
    .from('borrows')
    .select('id, item_id, borrower_id, status')
    .eq('id', params.borrowId)
    .single();

  if (borrowError || !borrow) notFound();

  // Only the borrower can file a report
  if (borrow.borrower_id !== user.id) redirect('/home');

  // Borrow must be active (handover confirmed)
  if (borrow.status !== 'active') redirect(`/item/${borrow.item_id}`);

  // ── Check for existing damage report ─────────────────────────────────────
  const { data: existingReport } = await supabase
    .from('damage_reports')
    .select('id, status, admin_chat_id')
    .eq('borrow_id', params.borrowId)
    .maybeSingle();

  // If a report already exists, redirect to the support chat
  if (existingReport) {
    if (existingReport.admin_chat_id) {
      redirect(`/chat/${existingReport.admin_chat_id}`);
    }
    // Report exists but chat_id unavailable — show item page
    redirect(`/item/${borrow.item_id}`);
  }

  // ── Fetch item category for header context ────────────────────────────────
  let categoryLabel = 'Item';
  const { data: item } = await supabase
    .from('items')
    .select('category')
    .eq('id', borrow.item_id)
    .single();

  if (item?.category) {
    categoryLabel = CATEGORY_LABELS[item.category as ItemCategory] ?? 'Item';
  }

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
          flex-shrink-0
          flex items-center gap-3 px-4
          bg-brand-bg
          border-b border-brand-dark/[0.06]
        "
        style={{
          paddingTop:    'calc(0.75rem + var(--sat, 0px))',
          paddingBottom: '0.75rem',
        }}
      >
        <Link
          href={`/chat`}
          className="
            flex items-center gap-1 shrink-0
            px-2.5 py-1.5 -ml-1 rounded-full
            text-brand-dark/60 text-[13px] font-medium
            active:bg-brand-dark/5 transition-colors
          "
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-brand-dark leading-tight">
            Report damage
          </p>
          <p className="text-[11px] text-brand-dark/40 leading-tight">{categoryLabel}</p>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="px-4 py-5"
          style={{ paddingBottom: 'calc(1.25rem + var(--sab, 0px))' }}
        >
          {/* Intro */}
          <div className="mb-5">
            <p className="text-[14px] text-brand-dark/55 leading-relaxed">
              Tell us what happened. Our team will review your report and follow
              up in a support chat within 24 hours.
            </p>
          </div>

          <ReportForm
            borrowId={params.borrowId}
            itemId={borrow.item_id}
            userId={user.id}
          />
        </div>
      </div>
    </main>
  );
}
