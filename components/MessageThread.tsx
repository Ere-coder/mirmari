'use client';

/**
 * MessageThread — shared client component for user and admin chat threads.
 *
 * Messages from currentUserId appear on the right (sent).
 * Messages from others appear on the left (received).
 * System messages are centred in small grey text.
 */

import { useState, useTransition, useEffect, useRef } from 'react';
import type { Message } from '@/lib/types-v2';

interface Props {
  chatId:        string;
  currentUserId: string;
  initialMessages: Message[];
  onSend:        (chatId: string, content: string) => Promise<{ success: boolean; error?: string }>;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDay(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function MessageThread({
  chatId,
  currentUserId,
  initialMessages,
  onSend,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText]         = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep messages in sync when page re-validates (router.refresh)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  function handleSend() {
    const content = text.trim();
    if (!content || isPending) return;

    // Optimistic update
    const optimistic: Message = {
      id:         crypto.randomUUID(),
      chat_id:    chatId,
      sender_id:  currentUserId,
      content,
      is_system:  false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setText('');
    setError(null);

    startTransition(async () => {
      const result = await onSend(chatId, content);
      if (!result.success) {
        // Revert optimistic message
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setError(result.error ?? 'Failed to send');
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group messages by day
  const groups: { day: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(msg);
    } else {
      groups.push({ day, messages: [msg] });
    }
  }

  return (
    <>
      {/* ── Message list ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
        {groups.map(group => (
          <div key={group.day}>
            {/* Day separator */}
            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-brand-dark/[0.06]" />
              <span className="text-[10px] font-medium text-brand-dark/30 uppercase tracking-widest">
                {group.day}
              </span>
              <span className="flex-1 h-px bg-brand-dark/[0.06]" />
            </div>

            <div className="flex flex-col gap-1.5">
              {group.messages.map(msg => {
                if (msg.is_system) {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <p className="text-[11px] text-brand-dark/35 text-center max-w-[240px] leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  );
                }

                const isMine = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      max-w-[75%] px-3.5 py-2.5 rounded-2xl
                      ${isMine
                        ? 'bg-brand-dark text-white rounded-br-sm'
                        : 'bg-brand-surface text-brand-dark rounded-bl-sm'
                      }
                    `}>
                      <p className="text-[14px] leading-relaxed break-words">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isMine ? 'text-white/50' : 'text-brand-dark/35'}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] text-brand-dark/30">No messages yet. Say hello!</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Send input ───────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-t border-brand-dark/[0.06] bg-brand-bg px-4 py-3 flex items-end gap-3"
        style={{ paddingBottom: 'calc(0.75rem + var(--sab, 0px))' }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          className="
            flex-1 resize-none rounded-2xl border border-brand-dark/15
            px-4 py-2.5 text-[14px] text-brand-dark
            placeholder:text-brand-dark/30
            focus:outline-none focus:border-brand-dark/30
            max-h-32 overflow-y-auto
          "
          style={{ lineHeight: '1.5' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || isPending}
          className="
            w-10 h-10 rounded-full bg-brand-dark flex items-center justify-center
            disabled:opacity-30 active:opacity-70 transition-opacity shrink-0
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {error && (
        <p className="text-[12px] text-red-500 px-4 pb-2">{error}</p>
      )}
    </>
  );
}
