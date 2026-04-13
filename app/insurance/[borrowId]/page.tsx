/**
 * Insurance Page — route: /insurance/[borrowId]
 *
 * Spec §INSURANCE SYSTEM:
 * - Shown after claim_item or confirm_queue_claim succeeds, before the chat opens.
 * - Fetches the pending insurance_payments row for this borrow.
 * - If insurance is already paid, redirects directly to the handover chat.
 * - Renders InsurancePaymentForm with the GEL amount and mocked payment methods.
 *
 * Server responsibilities:
 *   1. Verify the current user is the borrower for this borrow.
 *   2. Fetch insurance_payments row — redirect if already paid.
 *   3. Fetch item category for display context.
 *   4. Pass amount + borrowId to InsurancePaymentForm client component.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import InsurancePaymentForm from './InsurancePaymentForm';
import { CATEGORY_LABELS, type ItemCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { borrowId: string };
}

export default async function InsurancePage({ params }: PageProps) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch insurance_payments row ──────────────────────────────────────────
  const { data: insurance, error: insError } = await supabase
    .from('insurance_payments')
    .select('id, borrow_id, borrower_id, amount_gel, status, paid_at')
    .eq('borrow_id', params.borrowId)
    .single();

  if (insError || !insurance) notFound();

  // Verify the current user is the borrower
  if (insurance.borrower_id !== user.id) redirect('/home');

  // If already paid, redirect to the handover chat
  if (insurance.status === 'paid') {
    const { data: chat } = await supabase
      .from('chats')
      .select('id')
      .eq('borrow_id', params.borrowId)
      .eq('chat_type', 'handover')
      .single();

    if (chat) redirect(`/chat/${chat.id}`);
    redirect('/chats');
  }

  // ── Fetch item category for display context ───────────────────────────────
  const { data: borrow } = await supabase
    .from('borrows')
    .select('item_id')
    .eq('id', params.borrowId)
    .single();

  let categoryLabel = 'Item';
  if (borrow?.item_id) {
    const { data: item } = await supabase
      .from('items')
      .select('category')
      .eq('id', borrow.item_id)
      .single();

    if (item?.category) {
      categoryLabel = CATEGORY_LABELS[item.category as ItemCategory] ?? 'Item';
    }
  }

  const amountGel = Number(insurance.amount_gel);

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
          href="/home"
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
            Insurance
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
            <h1 className="text-[20px] font-bold text-brand-dark mb-1.5">
              One step left
            </h1>
            <p className="text-[14px] text-brand-dark/55 leading-relaxed">
              Pay a small insurance fee to unlock the handover chat and arrange
              picking up your item.
            </p>
          </div>

          <InsurancePaymentForm
            borrowId={params.borrowId}
            userId={user.id}
            amountGel={amountGel}
          />
        </div>
      </div>
    </main>
  );
}
