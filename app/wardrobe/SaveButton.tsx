'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleSave } from './actions';

interface Props {
  userId:     string | null;
  hasProfile: boolean;
  setId:      string;
  initialSaved: boolean;
}

export default function SaveButton({ userId, hasProfile, setId, initialSaved }: Props) {
  const router = useRouter();
  const [saved, setSaved]   = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    if (!userId) {
      router.push('/login');
      return;
    }
    if (!hasProfile) {
      router.push('/onboarding');
      return;
    }

    const next = !saved;
    setSaved(next);

    startTransition(async () => {
      const result = await toggleSave(setId);
      if (!result.success) setSaved(saved);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={saved ? 'Remove from saved' : 'Save outfit set'}
      className="
        w-8 h-8 flex items-center justify-center
        rounded-full bg-white/80 backdrop-blur-sm
        active:scale-90 transition-transform
        disabled:opacity-60
      "
    >
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={saved ? 'text-red-500' : 'text-brand-dark/60'}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
