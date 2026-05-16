'use client';

import { useState, useTransition } from 'react';
import { logReturn } from './actions';

type Condition = 'good' | 'minor_issue' | 'damaged';

const CONDITIONS: { value: Condition; label: string; color: string }[] = [
  { value: 'good',        label: 'Good',         color: 'bg-green-50 border-green-300 text-green-700' },
  { value: 'minor_issue', label: 'Minor issue',  color: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
  { value: 'damaged',     label: 'Damaged',      color: 'bg-red-50 border-red-300 text-red-500' },
];

interface Props {
  reservationId: string;
  onDone?: () => void;
}

export default function LogReturnForm({ reservationId, onDone }: Props) {
  const [condition, setCondition] = useState<Condition | null>(null);
  const [notes, setNotes]         = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!condition) return;
    setError(null);
    startTransition(async () => {
      const result = await logReturn(reservationId, condition, notes);
      if (result.success) {
        onDone?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Condition picker */}
      <div className="flex gap-2">
        {CONDITIONS.map(c => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCondition(c.value)}
            className={`
              flex-1 rounded-xl border py-2 text-[12px] font-semibold transition-all
              ${condition === c.value ? c.color : 'border-brand-dark/15 text-brand-dark/40 bg-white'}
            `}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="
          w-full rounded-xl border border-brand-dark/15
          px-3 py-2 text-[13px] text-brand-dark
          placeholder:text-brand-dark/30
          focus:outline-none focus:border-brand-dark/30
          resize-none
        "
      />

      {error && <p className="text-[12px] text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!condition || isPending}
        className="
          w-full bg-brand-accent text-brand-bg
          rounded-xl py-2.5 text-[13px] font-semibold
          disabled:opacity-40 active:opacity-80 transition-opacity
        "
      >
        {isPending ? 'Logging…' : 'Log return'}
      </button>
    </div>
  );
}
