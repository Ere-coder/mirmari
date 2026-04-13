/**
 * CreditPurchaseForm — client component for mock credit purchases.
 *
 * Spec §CREDIT SYSTEM: "payment is mocked — no real payment gateway in Phase 3".
 * Flow:
 *   1. User selects a preset amount (10 / 20 / 50 credits).
 *   2. Tapping "Buy" directly updates the credits.balance row and inserts a
 *      credit_transactions row (type: 'purchased', positive amount).
 *   3. router.refresh() re-fetches the server component so the balance updates.
 *
 * Phase 4: replace the direct DB write with a server-side RPC triggered after
 * real payment verification (Stripe / BOG / TBC).
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const PRESETS = [
  { credits: 10, gel: 20 },
  { credits: 20, gel: 40 },
  { credits: 50, gel: 100 },
];

interface Props {
  userId: string;
  currentBalance: number;
}

export default function CreditPurchaseForm({ userId, currentBalance }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  async function handleBuy() {
    if (selected === null) return;
    setError(null);
    setSuccess(false);
    setLoading(true);

    const supabase = createClient();

    try {
      // Step 1: Update credits balance (RLS policy: credits_update_own allows this)
      const { error: updateError } = await supabase
        .from('credits')
        .update({
          balance:    currentBalance + selected,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Step 2: Insert 'purchased' transaction for audit trail
      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount:  selected,
          type:    'purchased',
          item_id: null,
        });

      if (txError) throw txError;

      setSuccess(true);
      setSelected(null);
      // Refresh server component to show updated balance
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(`Purchase failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section label */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40 px-1">
        Add credits
      </p>

      {/* Preset chips */}
      <div className="bg-brand-surface rounded-2xl px-5 py-5">
        <div className="flex flex-col gap-3">
          {PRESETS.map(({ credits, gel }) => (
            <button
              key={credits}
              type="button"
              onClick={() => { setSelected(prev => prev === credits ? null : credits); setSuccess(false); }}
              className={`
                flex items-center justify-between
                px-4 py-4 rounded-xl
                text-[15px] font-medium
                transition-all duration-150 active:scale-[0.98]
                ${selected === credits
                  ? 'bg-brand-plum text-white'
                  : 'bg-brand-bg text-brand-dark'}
              `}
            >
              <span>{credits} credits</span>
              <span className={selected === credits ? 'text-white/70' : 'text-brand-dark/40'}>
                {gel} GEL
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Success message */}
      {success && (
        <p className="text-sm text-green-600 px-1" role="status">
          Credits added successfully.
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* Buy button */}
      <div className="pt-2 pb-2">
        <button
          type="button"
          disabled={selected === null || loading}
          onClick={handleBuy}
          className="
            w-full bg-brand-accent text-white
            rounded-2xl py-[18px]
            text-base font-semibold tracking-wide
            transition-opacity duration-200
            disabled:opacity-40
            active:opacity-75
          "
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2.5">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing…
            </span>
          ) : selected !== null ? (
            `Confirm purchase — ${PRESETS.find(p => p.credits === selected)!.gel} GEL`
          ) : (
            'Select an amount'
          )}
        </button>
      </div>

      {/* Mock payment disclaimer */}
      <p className="text-[11px] text-brand-dark/25 text-center px-4 leading-relaxed">
        This is a simulated purchase. No real payment is processed.
      </p>
    </div>
  );
}
