/**
 * Chat Page — route: /chat/[chatId]
 *
 * Spec §CHAT INTERFACE:
 * - Full-screen real-time chat between the item owner and the borrower.
 * - Header: back button (to /chats), other party's name/district, item category.
 * - Message list with real-time updates (via ChatInterface client component).
 * - Handover confirmation widget shown after 2 hours if not yet confirmed.
 *
 * Server Component responsibilities:
 *   1. Validate that the current user is a participant (owner or borrower).
 *   2. Fetch chat metadata, all messages, handover_confirmation, item info,
 *      and other party's profile.
 *   3. Call ensure_handover_prompt if 2+ hours have elapsed and handover is
 *      not yet confirmed (idempotent RPC — safe to call on every load).
 *   4. Determine showHandover = whether prompt has been sent (system msg exists).
 *   5. Pass everything to ChatInterface and HandoverConfirmation client components.
 *
 * No BottomNav on this page — the full screen is used by the chat UI.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ChatInterface from './ChatInterface';
import { CATEGORY_LABELS, type ItemCategory, type Message, type HandoverConfirmation } from '@/lib/types';
// Phase 8 §PUSH NOTIFICATIONS
import { notifyHandoverPending } from '@/lib/notifications/send';


export const dynamic = 'force-dynamic';

interface PageProps {
  params: { chatId: string };
}

export default async function ChatPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch chat + verify access ────────────────────────────────────────────
  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .select('id, borrow_id, item_id, owner_id, borrower_id, chat_type, owner_last_read_at, borrower_last_read_at, created_at')
    .eq('id', params.chatId)
    .single();

  if (chatError || !chat) notFound();

  // Redirect if current user is not a participant
  const isOwner = chat.owner_id === user.id;
  if (!isOwner && chat.borrower_id !== user.id) {
    redirect('/home');
  }

  const role        = isOwner ? 'owner' : 'borrower';
  const otherUserId = isOwner ? chat.borrower_id : chat.owner_id;
  const isAdminChat = (chat as { chat_type?: string }).chat_type === 'admin';

  // ── Phase 7: Insurance guard (handover chats only) ────────────────────────
  // If the borrower hasn't paid insurance yet, redirect to the payment page.
  // Only block the borrower (owner/giver is not asked to pay).
  if (!isAdminChat && !isOwner) {
    const { data: insurance } = await supabase
      .from('insurance_payments')
      .select('status')
      .eq('borrow_id', chat.borrow_id)
      .single();

    if (insurance && insurance.status === 'pending') {
      redirect(`/insurance/${chat.borrow_id}`);
    }
  }

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const [
    { data: messages },
    { data: item },
    { data: otherProfile },
    { data: handoverConf },
  ] = await Promise.all([
    // All messages in this chat, chronological order
    supabase
      .from('messages')
      .select('id, chat_id, sender_id, content, is_system, created_at')
      .eq('chat_id', params.chatId)
      .order('created_at', { ascending: true }),

    // Item category for the header
    supabase
      .from('items')
      .select('id, category')
      .eq('id', chat.item_id)
      .single(),

    // Other party's profile — Phase 8 §USER DISPLAY NAMES: display_name + district
    supabase
      .from('profiles')
      .select('display_name, district')
      .eq('id', otherUserId)
      .single(),

    // Handover confirmation state
    supabase
      .from('handover_confirmations')
      .select('id, borrow_id, confirmed_by_borrower, confirmed_by_owner, borrower_confirmed_at, owner_confirmed_at, fully_confirmed_at')
      .eq('borrow_id', chat.borrow_id)
      .maybeSingle(),
  ]);

  // ── Conditionally call ensure_handover_prompt ─────────────────────────────
  // Spec §CHAT INTERFACE: "2 hours after chat creation, insert prompt if not done yet."
  // We call on every page load; the RPC guards against duplicates internally.
  const chatAgeMs       = Date.now() - new Date(chat.created_at).getTime();
  const twoHoursMs      = 2 * 60 * 60 * 1000;
  const notYetConfirmed = !handoverConf?.fully_confirmed_at;

  if (chatAgeMs >= twoHoursMs && notYetConfirmed) {
    // Only the first call actually inserts the system message — detect this by checking
    // whether a system message already existed before we called the RPC.
    const hadSystemMessage = (messages ?? []).some((m: { is_system?: boolean }) => m.is_system);

    await supabase.rpc('ensure_handover_prompt', { p_chat_id: params.chatId });

    // Phase 8 §PUSH NOTIFICATIONS: notify both parties the first time the prompt fires.
    // If a system message already existed, the RPC was a no-op and we skip re-notifying.
    if (!hadSystemMessage && !isAdminChat) {
      // Fire-and-forget — failures must not block the page render
      notifyHandoverPending({ userId: chat.owner_id,    chatId: params.chatId }).catch(() => {});
      notifyHandoverPending({ userId: chat.borrower_id, chatId: params.chatId }).catch(() => {});
    }
  }

  // ── Determine whether to show HandoverConfirmation widget ─────────────────
  // Admin chats never show the handover widget.
  // For handover chats: show when 2h has elapsed and not yet fully confirmed.
  const showHandover = !isAdminChat && notYetConfirmed && (chatAgeMs >= twoHoursMs);

  // ── Phase 7: Detect confirmed borrower for Report Damage button ───────────
  // Only show the report button in handover chats, for the borrower, after handover confirmed.
  let activeBorrowId: string | null = null;
  let isConfirmedBorrow = false;
  if (!isAdminChat && !isOwner) {
    const { data: borrow } = await supabase
      .from('borrows')
      .select('id, status')
      .eq('id', chat.borrow_id)
      .single();
    if (borrow?.status === 'active') {
      isConfirmedBorrow = true;
      activeBorrowId    = borrow.id;
    }
  }

  // ── Build display labels ──────────────────────────────────────────────────
  const categoryLabel = item?.category
    ? CATEGORY_LABELS[item.category as ItemCategory]
    : 'Item';

  // Admin chats show a fixed label regardless of who the "other" party is.
  // Phase 8 §USER DISPLAY NAMES: show display_name if set, else district.
  const otherProfileTyped = otherProfile as unknown as { display_name?: string | null; district?: string } | null;
  const otherLabel = isAdminChat
    ? 'MirMari Support'
    : otherProfileTyped?.display_name
      ? `${otherProfileTyped.display_name} · ${otherProfileTyped.district ?? 'Tbilisi'}`
      : (otherProfileTyped?.district ?? 'Tbilisi');

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* ── Fixed header ─────────────────────────────────────────────────────── */}
      <div
        className="
          flex-shrink-0
          flex items-center gap-3 px-4
          bg-brand-bg
          border-b border-brand-dark/[0.06]
        "
        style={{
          paddingTop:    'calc(0.75rem + var(--sat, 0px))',
          paddingBottom: '0.75rem',
        }}
      >
        {/* Back to /chats */}
        <Link
          href="/chats"
          className="
            flex items-center gap-1 shrink-0
            px-2.5 py-1.5 -ml-1 rounded-full
            text-brand-dark/60 text-[13px] font-medium
            active:bg-brand-dark/5 transition-colors
          "
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>

        {/* Other party info */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-brand-dark truncate leading-tight">
            {otherLabel}
          </p>
          <p className="text-[11px] text-brand-dark/40 truncate leading-tight">{categoryLabel}</p>
        </div>

        {/* Phase 7: Report Damage — visible to confirmed borrowers in handover chats */}
        {isConfirmedBorrow && activeBorrowId && (
          <Link
            href={`/report/${activeBorrowId}`}
            className="
              shrink-0 px-3 py-1.5 rounded-full
              bg-red-50 text-red-400
              text-[12px] font-medium
              active:opacity-70 transition-opacity
            "
          >
            Report damage
          </Link>
        )}
      </div>

      {/* ── Chat interface (messages + input) ──────────────────────────────── */}
      {/*
        ChatInterface manages its own scroll and fixed input positioning.
        The flex-1 + overflow-hidden container gives it a bounded region.
      */}
      <div className="flex-1 overflow-hidden relative">
        <ChatInterface
          chatId={params.chatId}
          userId={user.id}
          role={role as 'owner' | 'borrower'}
          initialMessages={(messages ?? []) as Message[]}
          otherLabel={otherLabel}
          handoverConf={(handoverConf as HandoverConfirmation | null)}
          borrowId={chat.borrow_id}
          showHandover={showHandover}
        />
      </div>
    </main>
  );
}
