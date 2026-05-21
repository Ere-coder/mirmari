/**
 * Admin — message thread: /admin/messages/[chatId]
 * Admin view: full thread + reply input.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import MessageThread from '@/components/MessageThread';
import { CHAT_SUBJECT_LABELS } from '@/lib/types-v2';
import { sendAdminMessage } from '@/app/messages/actions';
import type { ChatSubject, Message } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

export default async function AdminChatThreadPage({
  params,
}: {
  params: { chatId: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (!await isAdminUser(user.id)) redirect('/wardrobe');

  const [{ data: chat }, { data: messagesData }] = await Promise.all([
    supabase
      .from('support_chats')
      .select(`
        id, subject, user_id,
        profiles ( delivery_zone )
      `)
      .eq('id', params.chatId)
      .single(),
    supabase
      .from('support_messages')
      .select('id, chat_id, sender_id, content, is_system, created_at')
      .eq('chat_id', params.chatId)
      .order('created_at', { ascending: true }),
  ]);

  if (!chat) notFound();

  const messages = (messagesData ?? []) as Message[];
  const subject  = chat.subject as ChatSubject;
  const chatUser = chat as unknown as {
    id: string; subject: string; user_id: string;
    profiles: { delivery_zone: string | null } | null;
  };
  const userName = chatUser.profiles?.delivery_zone ?? 'User';

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06] flex items-center gap-4"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <Link
          href="/admin/messages"
          className="text-brand-dark/40 active:text-brand-dark/70 transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <p className="text-[16px] font-bold text-brand-dark">{userName}</p>
          <p className="text-[11px] text-brand-dark/35">{CHAT_SUBJECT_LABELS[subject]}</p>
        </div>
      </div>

      {/* Thread — admin is current user so their messages appear on the right */}
      <MessageThread
        chatId={chat.id}
        currentUserId={user.id}
        initialMessages={messages}
        onSend={sendAdminMessage}
      />
    </main>
  );
}
