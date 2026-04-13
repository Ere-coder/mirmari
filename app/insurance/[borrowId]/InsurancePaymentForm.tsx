/**
 * InsurancePaymentForm — client component for the mocked insurance payment step.
 *
 * Spec §INSURANCE SYSTEM:
 * - Shown once, between claiming an item and accessing the handover chat.
 * - User selects a payment method and taps "Pay" — no real payment is processed.
 * - Calls pay_insurance RPC which flips insurance_payments.status → 'paid'.
 * - On success, navigates to /chat/[chatId] (the handover chat for this borrow).
 *
 * Payment methods displayed (all mocked): Visa, Mastercard, TBC/BOG bank transfer,
 * Apple Pay, Google Pay.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PayInsuranceResult } from '@/lib/types';

type PaymentMethod = 'visa' | 'mastercard' | 'bank' | 'apple_pay' | 'google_pay';

interface Props {
  borrowId: string;
  userId: string;
  amountGel: number;
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string; sub?: string }[] = [
  { id: 'visa',       label: 'Visa',        sub: 'Credit or debit card' },
  { id: 'mastercard', label: 'Mastercard',   sub: 'Credit or debit card' },
  { id: 'bank',       label: 'Bank transfer', sub: 'TBC / BOG / other Georgian banks' },
  { id: 'apple_pay',  label: 'Apple Pay' },
  { id: 'google_pay', label: 'Google Pay' },
];

export default function InsurancePaymentForm({ borrowId, userId, amountGel }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<PaymentMethod>('visa');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: rpcError } = await supabase.rpc('pay_insurance', {
        p_borrow_id:   borrowId,
        p_borrower_id: userId,
      });
      if (rpcError) throw rpcError;
      const result = data as PayInsuranceResult;
      if (result.success) {
        router.push(`/chat/${result.chat_id}`);
      } else {
        const messages: Record<string, string> = {
          unauthorized:      'Something went wrong. Please try again.',
          borrow_not_found:  'Borrow record not found.',
          not_borrower:      'You are not the borrower for this item.',
          insurance_not_found: 'Insurance record not found.',
          already_paid:      'Insurance was already paid.',
          chat_not_found:    'Chat not found.',
        };
        setError(messages[result.reason] ?? 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Amount card */}
      <div className="rounded-2xl bg-brand-surface px-5 py-5 text-center">
        <p className="text-[13px] text-brand-dark/45 mb-1">Insurance fee</p>
        <p className="text-[36px] font-bold text-brand-dark leading-none">
          {amountGel.toFixed(2)}
          <span className="text-[18px] font-semibold ml-1">GEL</span>
        </p>
        <p className="text-[12px] text-brand-dark/40 mt-2 leading-relaxed">
          Covers damage during your borrow period.
          <br />
          Non-refundable after handover is confirmed.
        </p>
      </div>

      {/* Payment method selector */}
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-brand-dark/45 px-1 uppercase tracking-wide">
          Payment method
        </p>
        {PAYMENT_METHODS.map(method => (
          <button
            key={method.id}
            type="button"
            onClick={() => setSelected(method.id)}
            className={`
              flex items-center justify-between
              rounded-2xl px-5 py-4
              text-left transition-colors
              ${selected === method.id
                ? 'bg-brand-accent/10 ring-1 ring-brand-accent/40'
                : 'bg-brand-surface active:bg-brand-dark/5'}
            `}
          >
            <div>
              <p className={`text-[14px] font-medium ${selected === method.id ? 'text-brand-accent' : 'text-brand-dark'}`}>
                {method.label}
              </p>
              {method.sub && (
                <p className="text-[12px] text-brand-dark/40 mt-0.5">{method.sub}</p>
              )}
            </div>
            {/* Selection indicator */}
            <span
              className={`
                w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                ${selected === method.id
                  ? 'border-brand-accent bg-brand-accent'
                  : 'border-brand-dark/20 bg-transparent'}
              `}
            >
              {selected === method.id && (
                <span className="w-2 h-2 rounded-full bg-white" />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* Pay button */}
      <button
        type="button"
        disabled={loading}
        onClick={handlePay}
        className="
          w-full bg-brand-accent text-white
          rounded-2xl py-4
          text-[15px] font-semibold
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
        ) : (
          `Pay ${amountGel.toFixed(2)} GEL`
        )}
      </button>

      <p className="text-[11px] text-brand-dark/30 text-center leading-relaxed px-2">
        This is a demo. No real payment will be processed.
      </p>
    </div>
  );
}
