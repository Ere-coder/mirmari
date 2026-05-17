'use client';

/**
 * New conversation — route: /messages/new
 *
 * User picks a subject and writes their first message.
 * Submits via createChat server action which redirects to the thread.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createChat } from '../actions';
import { CHAT_SUBJECT_LABELS } from '@/lib/types-v2';
import type { ChatSubject } from '@/lib/types-v2';

const SUBJECTS: { value: ChatSubject; label: string; description: string }[] = [
  { value: 'delivery', label: 'Delivery',      description: 'Questions about your delivery or return pickup' },
  { value: 'sizing',   label: 'Sizing',         description: 'Help choosing the right size or fit' },
  { value: 'support',  label: 'Support',        description: 'Subscription, billing, or account issues' },
  { value: 'general',  label: 'General',        description: 'Anything else on your mind' },
];

export default function NewChatPage() {
  const router = useRouter();
  const [subject, setSubject]   = useState<ChatSubject | null>(null);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!subject || !message.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createChat(subject, message);
      } catch {
        setError('Failed to start conversation. Please try again.');
      }
    });
  }

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06] flex items-center gap-4"
        style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="text-brand-dark/40 active:text-brand-dark/70 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[18px] font-bold text-brand-dark">New conversation</h1>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">

        {/* Subject picker */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
            What&apos;s this about?
          </p>
          <div className="flex flex-col gap-2">
            {SUBJECTS.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSubject(s.value)}
                className={`
                  rounded-2xl border p-4 text-left transition-all
                  ${subject === s.value
                    ? 'border-brand-dark/40 bg-brand-surface'
                    : 'border-brand-dark/[0.08] bg-white'
                  }
                `}
              >
                <p className="text-[14px] font-semibold text-brand-dark">{s.label}</p>
                <p className="text-[12px] text-brand-dark/45 mt-0.5">{s.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        {subject && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
              Your message
            </p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your message…"
              rows={5}
              className="
                w-full rounded-2xl border border-brand-dark/[0.08]
                px-4 py-3 text-[14px] text-brand-dark
                placeholder:text-brand-dark/30
                focus:outline-none focus:border-brand-dark/25
                resize-none bg-white
              "
            />
          </div>
        )}

        {error && <p className="text-[12px] text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!subject || !message.trim() || isPending}
          className="
            w-full bg-brand-accent text-brand-bg
            rounded-2xl py-3.5 text-[14px] font-semibold
            disabled:opacity-40 active:opacity-80 transition-opacity
          "
        >
          {isPending ? 'Starting…' : 'Send message'}
        </button>

      </div>
    </main>
  );
}
