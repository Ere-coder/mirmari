/**
 * Messages — route: /messages
 *
 * Phase 7: lists user's conversations. "New" button starts a chat.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import { CHAT_SUBJECT_LABELS } from '@/lib/types-v2';
import type { ChatSubject } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

const SUBJECT_COLORS: Record<ChatSubject, string> = {
  delivery: 'bg-blue-50 text-blue-600',
  sizing:   'bg-purple-50 text-purple-600',
  support:  'bg-orange-50 text-orange-600',
  general:  'bg-brand-surface text-brand-dark/50',
};

export default async function MessagesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/onboarding');

  const { data: chatsData } = await supabase
    .from('support_chats')
    .select(`
      id, subject, updated_at,
      support_messages ( content, created_at, sender_id )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  type ChatRow = {
    id: string; subject: string; updated_at: string;
    support_messages: { content: string; created_at: string; sender_id: string }[];
  };
  const chats = (chatsData ?? []) as unknown as ChatRow[];

  function lastMessage(chat: ChatRow) {
    if (!chat.support_messages?.length) return null;
    return [...chat.support_messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }

  function timeAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  return (
    <>
      <main
        className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
        style={{ height: '100dvh' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06] flex items-center justify-between"
          style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))', paddingBottom: '1rem' }}
        >
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-brand-dark/35 mb-0.5">
              MirMari
            </p>
            <h1 className="text-[22px] font-bold text-brand-dark">Messages</h1>
          </div>
          <Link
            href="/messages/new"
            className="
              w-8 h-8 rounded-full bg-brand-dark flex items-center justify-center
              active:opacity-70 transition-opacity
            "
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Link>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 gap-5">
              <div className="w-14 h-14 flex items-center justify-center text-brand-dark/10">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="text-center max-w-xs">
                <p className="text-[15px] font-medium text-brand-dark mb-2">No conversations yet</p>
                <p className="text-[13px] text-brand-dark/50 leading-relaxed">
                  Need help with delivery, sizing, or your subscription? We respond within a few hours.
                </p>
              </div>
              <Link
                href="/messages/new"
                className="bg-brand-accent text-brand-bg rounded-2xl px-6 py-3 text-[13px] font-medium active:opacity-80"
              >
                Start a conversation
              </Link>
            </div>
          ) : (
            <div
              className="flex flex-col divide-y divide-brand-dark/[0.04]"
              style={{ paddingBottom: 'calc(6rem + var(--sab, 0px))' }}
            >
              {chats.map(chat => {
                const last    = lastMessage(chat);
                const subject = chat.subject as ChatSubject;
                return (
                  <Link
                    key={chat.id}
                    href={`/messages/${chat.id}`}
                    className="flex items-center gap-4 px-5 py-4 active:bg-brand-surface transition-colors"
                  >
                    {/* Subject icon circle */}
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center shrink-0
                      text-[11px] font-bold ${SUBJECT_COLORS[subject]}
                    `}>
                      {CHAT_SUBJECT_LABELS[subject][0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[14px] font-semibold text-brand-dark">
                          {CHAT_SUBJECT_LABELS[subject]}
                        </p>
                        {last && (
                          <p className="text-[11px] text-brand-dark/30 shrink-0">
                            {timeAgo(last.created_at)}
                          </p>
                        )}
                      </div>
                      {last && (
                        <p className="text-[13px] text-brand-dark/45 truncate mt-0.5">
                          {last.sender_id === user.id ? 'You: ' : ''}{last.content}
                        </p>
                      )}
                    </div>
                    <span className="text-brand-dark/20 text-base shrink-0">›</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </>
  );
}
