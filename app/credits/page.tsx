/**
 * Credits Page — route: /credits
 *
 * Spec §CREDIT SYSTEM:
 * - Shows the user's current balance.
 * - Allows purchasing credits (payment is mocked in Phase 3).
 * - 1 credit = 2 GEL. Preset options: 10, 20, 50 credits.
 *
 * Phase 4 update — Spec §AVAILABLE CREDIT CHECK:
 * - Shows effective balance (credits.balance − reserved credits in queue entries).
 * - Shows a breakdown note when credits are soft-locked in the queue.
 * - CreditPurchaseForm receives currentBalance (raw) so the mock purchase adds
 *   to the actual balance, not the effective balance.
 *
 * Server Component: fetches balance and reserved amounts, renders CreditPurchaseForm (Client).
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CreditPurchaseForm from './CreditPurchaseForm';
import BottomNav from '@/components/BottomNav';

export const dynamic = 'force-dynamic';

export default async function CreditsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch balance and soft-locked reserved credits ────────────────────────
  const [{ data: credits }, { data: reservedRows }] = await Promise.all([
    supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single(),
    // All active queue entries where this user has reserved credits
    supabase
      .from('queue')
      .select('reserved_credits, item_id')
      .eq('user_id', user.id)
      .eq('status', 'waiting')
      .gt('reserved_credits', 0),
  ]);

  const rawBalance    = credits?.balance ?? 0;
  const reservedList  = reservedRows ?? [];
  const totalReserved = reservedList.reduce((sum, r) => sum + (r.reserved_credits ?? 0), 0);

  // Spec §AVAILABLE CREDIT CHECK: effective balance is what the user can actually spend.
  const effectiveBalance = rawBalance - totalReserved;

  return (
    <>
      <main className="min-h-screen px-5 pb-32 pt-12">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-[26px] font-semibold text-brand-dark tracking-tight leading-tight">
            Credits
          </h1>
          <p className="text-[15px] text-brand-dark/45 mt-2 leading-relaxed">
            Use credits to borrow items from others.
          </p>
        </div>

        {/* ── Balance card ─────────────────────────────────────────────────── */}
        <div className="bg-brand-surface rounded-2xl px-5 py-6 mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-dark/40 mb-1">
            Available balance
          </p>
          <p className="text-[36px] font-semibold text-brand-dark leading-none">
            {effectiveBalance}
            <span className="text-[16px] font-normal text-brand-dark/45 ml-2">credits</span>
          </p>

          {/* ── Reserved credits breakdown (Phase 4) ─────────────────────── */}
          {/* Only shown when the user has credits soft-locked in the queue.
              Helps users understand why their available balance is lower than expected. */}
          {totalReserved > 0 && (
            <div className="mt-3 pt-3 border-t border-brand-dark/8">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-brand-dark/40">Total balance</span>
                <span className="text-[12px] text-brand-dark/40">{rawBalance} credits</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[12px] text-brand-dark/40">
                  Reserved in {reservedList.length === 1 ? '1 queue' : `${reservedList.length} queues`}
                </span>
                <span className="text-[12px] text-brand-dark/40">−{totalReserved} credits</span>
              </div>
            </div>
          )}
        </div>

        {/* Rate note */}
        <p className="text-[12px] text-brand-dark/35 px-1 mb-6">
          1 credit = 2 GEL
        </p>

        {/* Purchase form — receives rawBalance so mock purchase adds to actual balance */}
        <CreditPurchaseForm userId={user.id} currentBalance={rawBalance} />
      </main>

      <BottomNav />
    </>
  );
}
