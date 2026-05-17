/**
 * Message thread — route: /messages/[chatId]
 * User view: shows messages + send input.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import MessageThread from '@/components/MessageThread';
import BottomNav from '@/components/BottomNav';
import { CHAT_SUBJECT_LABELS } from '@/lib/types-v2';
import { sendMessage } from '../actions';
import type { ChatSubject, Message } from '@/lib/types-v2';

export const dynamic = 'force-dynamic';

export default async function ChatThreadPage({
  params,
}: {
  params: { chatId: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const [{ data: chat }, { data: messagesData }] = await Promise.all([
    supabase
      .from('support_chats')
      .select('id, subject, user_id')
      .eq('id', params.chatId)
      .eq('user_id', user.id)
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

  return (
    <>
      <main
        className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
        style={{ height: '100dvh' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06] flex items-center gap-4"
          style={{ paddingTop: 'calc(1.25rem + var(--sat, 0px))', paddingBottom: '1rem' }}
        >
          <Link
            href="/messages"
            className="text-brand-dark/40 active:text-brand-dark/70 transition-colors shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <p className="text-[16px] font-bold text-brand-dark">
              {CHAT_SUBJECT_LABELS[subject]}
            </p>
            <p className="text-[11px] text-brand-dark/35">MirMari support</p>
          </div>
        </div>

        {/* Thread */}
        <MessageThread
          chatId={chat.id}
          currentUserId={user.id}
          initialMessages={messages}
          onSend={sendMessage}
        />
      </main>

      <BottomNav />
    </>
  );
}
