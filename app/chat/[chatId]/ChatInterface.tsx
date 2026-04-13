/**
 * ChatInterface — real-time chat client component for /chat/[chatId].
 *
 * Spec §CHAT INTERFACE:
 * - Shows all messages in the chat (initial set from server, live updates via Supabase realtime).
 * - System messages are centered and muted; user messages are left (other) / right (own).
 * - Consecutive messages from the same sender are grouped (sender label only on first).
 * - Fixed input bar at the bottom for composing and sending messages.
 * - Updates owner_last_read_at or borrower_last_read_at on mount and on new messages.
 * - Scrolls to the latest message on mount and when new messages arrive.
 * - HandoverConfirmation widget shown above the input when confirmation is pending
 *   (after the 2-hour prompt system message has been inserted by ensure_handover_prompt).
 *
 * Connects to: Supabase realtime postgres_changes on messages table,
 *              messages INSERT for sending,
 *              chats UPDATE for last_read_at.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import HandoverConfirmation from './HandoverConfirmation';
import type { Message, HandoverConfirmation as HandoverConf } from '@/lib/types';

interface Props {
  chatId:        string;
  userId:        string;
  /** 'owner' or 'borrower' — determines which last_read_at field to update. */
  role:          'owner' | 'borrower';
  /** Hydrated from server; realtime appends to this. */
  initialMessages: Message[];
  /** Other party's display label (name · district or just district). */
  otherLabel:    string;
  /** Fetched from handover_confirmations by the server. Null if not yet created. */
  handoverConf:  HandoverConf | null;
  borrowId:      string;
  /** Whether to show the handover confirmation widget (2h elapsed + not confirmed). */
  showHandover:  boolean;
}

// ── Timestamp formatting ───────────────────────────────────────────────────────
function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatInterface({
  chatId,
  userId,
  role,
  initialMessages,
  otherLabel,
  handoverConf,
  borrowId,
  showHandover,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Scroll to bottom when messages change ─────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Update last_read_at on mount and when new messages arrive ─────────────
  // Uses the correct column for the current user's role.
  const updateLastRead = useCallback(async () => {
    const supabase = createClient();
    const field = role === 'owner' ? 'owner_last_read_at' : 'borrower_last_read_at';
    await supabase
      .from('chats')
      .update({ [field]: new Date().toISOString() })
      .eq('id', chatId);
  }, [chatId, role]);

  useEffect(() => {
    updateLastRead();
  }, [updateLastRead]);

  // ── Realtime subscription to new messages ─────────────────────────────────
  // Subscribed once on mount; deduplicates by message ID in case of replays.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-${chatId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            // Deduplicate by ID (protects against double-delivery)
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Mark as read when new message arrives while screen is open
          updateLastRead();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, updateLastRead]);

  // ── Send message ───────────────────────────────────────────────────────────
  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setText('');
    const supabase = createClient();
    try {
      await supabase.from('messages').insert({
        chat_id:   chatId,
        sender_id: userId,
        content:   trimmed,
        is_system: false,
      });
      // Realtime subscription will add the message to state.
    } catch {
      // Restore text so the user doesn't lose their message
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  // ── Handle Enter key in the text input ────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Group consecutive messages by sender ──────────────────────────────────
  // Used to show the sender label only once per run of messages.
  type MsgGroup = { senderId: string; isSystem: boolean; items: Message[] };

  const groups: MsgGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.senderId === msg.sender_id && last.isSystem === msg.is_system) {
      last.items.push(msg);
    } else {
      groups.push({ senderId: msg.sender_id, isSystem: msg.is_system, items: [msg] });
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Message list ────────────────────────────────────────────────────── */}
      {/*
        Scrollable region. Padding at top for the fixed header (64px + sat),
        at bottom for the input bar + handover widget (approx 140px).
        The exact bottom padding is handled by the container structure below.
      */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{
          paddingTop:    'calc(64px + var(--sat, 0px) + 1rem)',
          paddingBottom: '180px',  // space for input bar + possible handover widget
        }}
      >
        {messages.length === 0 && (
          <p className="text-center text-[13px] text-brand-dark/35 py-8">
            Say hello to coordinate the handover.
          </p>
        )}

        {groups.map((group, gi) => {
          const isOwn    = group.senderId === userId;
          const isSys    = group.isSystem;

          return (
            <div key={gi} className={`mb-3 ${isSys ? 'flex flex-col items-center' : ''}`}>
              {/* Sender label — shown above each group (not for own, not for system) */}
              {!isSys && !isOwn && (
                <p className="text-[11px] text-brand-dark/40 mb-1 ml-1">
                  {otherLabel}
                </p>
              )}

              {/* Message bubbles */}
              <div className={`flex flex-col gap-1 ${isSys ? 'items-center' : isOwn ? 'items-end' : 'items-start'}`}>
                {group.items.map(msg => (
                  <div key={msg.id}>
                    {isSys ? (
                      /* System message: centered, muted, no bubble */
                      <p className="text-[12px] text-brand-dark/40 text-center italic px-4 py-1 leading-relaxed">
                        {msg.content}
                      </p>
                    ) : (
                      /* User message bubble */
                      <div
                        className={`
                          max-w-[75vw] px-3.5 py-2.5 rounded-2xl
                          ${isOwn
                            ? 'bg-brand-accent text-white rounded-br-md'
                            : 'bg-brand-surface text-brand-dark rounded-bl-md'}
                        `}
                      >
                        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    )}
                    {/* Timestamp below each bubble (not system messages) */}
                    {!isSys && (
                      <p className={`text-[10px] mt-0.5 text-brand-dark/30 ${isOwn ? 'text-right' : 'text-left'}`}>
                        {formatMsgTime(msg.created_at)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Bottom area: handover widget + input bar ─────────────────────────── */}
      {/*
        Fixed to the bottom of the viewport (within the app column).
        Handover widget floats just above the text input.
      */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app"
        style={{ paddingBottom: 'calc(0.75rem + var(--sab, 0px))' }}
      >
        {/* Handover confirmation widget — shown once prompt has been sent */}
        {showHandover && handoverConf && !handoverConf.fully_confirmed_at && (
          <HandoverConfirmation
            borrowId={borrowId}
            userId={userId}
            role={role}
            initialConf={handoverConf}
          />
        )}

        {/* Input bar */}
        <div className="flex items-end gap-2 px-4 pt-2 bg-brand-bg border-t border-brand-dark/[0.06]">
          <textarea
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            className="
              flex-1 resize-none overflow-hidden
              bg-brand-surface rounded-2xl
              px-4 py-3
              text-[14px] text-brand-dark placeholder:text-brand-dark/30
              outline-none
              max-h-[120px]
            "
            // Auto-grow the textarea up to max-h
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="button"
            disabled={!text.trim() || sending}
            onClick={handleSend}
            className="
              flex-shrink-0 w-10 h-10 mb-[3px]
              rounded-full bg-brand-accent
              flex items-center justify-center
              transition-opacity duration-150
              disabled:opacity-30
              active:opacity-70
            "
            aria-label="Send message"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
