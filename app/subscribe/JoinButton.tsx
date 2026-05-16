'use client';

import { useTransition } from 'react';
import { joinWaitlist } from './actions';

export default function JoinButton({ isActive }: { isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinWaitlist();
    });
  }

  return (
    <button
      type="button"
      onClick={handleJoin}
      disabled={pending}
      className="
        w-full bg-brand-accent text-brand-bg
        rounded-2xl px-6 py-4
        text-base font-medium
        disabled:opacity-60 active:opacity-80
        transition-opacity
      "
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-brand-bg/40 border-t-brand-bg rounded-full animate-spin" />
          Joining…
        </span>
      ) : isActive ? (
        'Join Now'
      ) : (
        'Join Waitlist'
      )}
    </button>
  );
}
