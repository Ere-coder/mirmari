/**
 * Admin — Messages: /admin/messages
 * Lists all user conversations, most recently updated first.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CHAT_SUBJECT_LABELS } from '@/lib/types-v2';
import type { ChatSubject } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

const SUBJECT_COLORS: Record<ChatSubject, string> = {
  delivery: 'bg-blue-50 text-blue-600',
  sizing:   'bg-purple-50 text-purple-600',
  support:  'bg-orange-50 text-orange-600',
  general:  'bg-brand-surface text-brand-dark/50',
};

export default async function AdminMessagesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: p } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!p?.is_admin) redirect('/wardrobe');

  const { data: chatsData } = await supabase
    .from('support_chats')
    .select(`
      id, subject, updated_at, user_id,
      profiles ( delivery_zone, district ),
      support_messages ( content, created_at, sender_id )
    `)
    .order('updated_at', { ascending: false });

  type ChatRow = {
    id: string; subject: string; updated_at: string; user_id: string;
    profiles: { delivery_zone: string | null; district: string | null } | null;
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
    const diff  = Date.now() - new Date(ts).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  function userName(chat: ChatRow) {
    return chat.profiles?.delivery_zone ?? chat.profiles?.district ?? chat.user_id.slice(0, 8);
  }

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <Link href="/admin" className="text-[12px] text-brand-dark/40 mb-0.5 block">← Admin</Link>
        <h1 className="text-[20px] font-bold text-brand-dark">Messages</h1>
        <p className="text-[11px] text-brand-dark/35">{chats.length} conversation{chats.length === 1 ? '' : 's'}</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-brand-dark/40">No conversations yet.</p>
          </div>
        ) : (
          <div
            className="flex flex-col divide-y divide-brand-dark/[0.04]"
            style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
          >
            {chats.map(chat => {
              const last    = lastMessage(chat);
              const subject = chat.subject as ChatSubject;
              return (
                <Link
                  key={chat.id}
                  href={`/admin/messages/${chat.id}`}
                  className="flex items-center gap-4 px-5 py-4 active:bg-brand-surface transition-colors"
                >
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center shrink-0
                    text-[11px] font-bold ${SUBJECT_COLORS[subject]}
                  `}>
                    {CHAT_SUBJECT_LABELS[subject][0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[14px] font-semibold text-brand-dark truncate">
                        {userName(chat)}
                      </p>
                      {last && (
                        <p className="text-[11px] text-brand-dark/30 shrink-0">
                          {timeAgo(last.created_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${SUBJECT_COLORS[subject]}`}>
                        {CHAT_SUBJECT_LABELS[subject]}
                      </span>
                      {last && (
                        <p className="text-[12px] text-brand-dark/40 truncate">
                          {last.sender_id !== chat.user_id ? 'You: ' : ''}{last.content}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-brand-dark/20 text-base shrink-0">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
