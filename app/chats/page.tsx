/**
 * Chats List Page — route: /chats
 *
 * Spec §CHAT SYSTEM:
 * Shows all active chats for the current user (as either owner or borrower).
 * Each row links to /chat/[id] and shows:
 *   - Item forward-image thumbnail
 *   - Item category + other party name / district
 *   - Last message preview (truncated)
 *   - Timestamp of last message
 *   - Unread indicator (accent dot) when there are unread non-system messages
 *
 * Chats are ordered by creation date (newest first) — simple initial implementation.
 * "Empty state" shown when the user has no chats.
 *
 * Server Component: all data fetched server-side.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import { CATEGORY_LABELS, type ItemCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ── Time formatting ────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffH  = diffMs / 3_600_000;
  if (diffH < 24) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffH < 7 * 24) {
    return date.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default async function ChatsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch all chats where current user is a participant ──────────────────────
  const { data: chatsRaw } = await supabase
    .from('chats')
    .select('id, borrow_id, item_id, owner_id, borrower_id, chat_type, owner_last_read_at, borrower_last_read_at, created_at')
    .or(`owner_id.eq.${user.id},borrower_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  const chats = chatsRaw ?? [];

  if (chats.length === 0) {
    return (
      <main className="min-h-screen bg-brand-bg pb-28">
        {/* Header */}
        <div className="px-5 pt-14 pb-4">
          <h1 className="text-[22px] font-semibold text-brand-dark tracking-tight">Chats</h1>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center px-8 pt-20 text-center">
          <p className="text-[15px] text-brand-dark/40 leading-relaxed">
            No chats yet.
          </p>
          <p className="text-[13px] text-brand-dark/30 mt-1.5 leading-relaxed">
            When you borrow an item, a chat will open to coordinate the handover.
          </p>
        </div>

        <BottomNav />
      </main>
    );
  }

  // ── Parallel data fetches for chat list details ────────────────────────────
  const chatIds      = chats.map(c => c.id);
  const itemIds      = Array.from(new Set(chats.map(c => c.item_id)));
  // For each chat, the "other party" is whoever is not the current user
  const otherUserIds = Array.from(new Set(
    chats.map(c => c.owner_id === user.id ? c.borrower_id : c.owner_id)
  ));

  const [
    { data: forwardImages },
    { data: otherProfiles },
    { data: allMessages },
    { data: itemCategories },
  ] = await Promise.all([
    // Forward image for each item (thumbnail display)
    supabase
      .from('item_images')
      .select('item_id, url')
      .in('item_id', itemIds)
      .eq('is_forward', true),
    // Other party's profile (display_name + district) — Phase 8 §USER DISPLAY NAMES
    supabase
      .from('profiles')
      .select('id, display_name, district')
      .in('id', otherUserIds),
    // All messages for these chats — grouped in JS to find last + unread
    supabase
      .from('messages')
      .select('chat_id, content, sender_id, is_system, created_at')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false })
      .limit(500),  // generous upper bound across all chats
    // Item category for display label
    supabase
      .from('items')
      .select('id, category')
      .in('id', itemIds),
  ]);

  // ── Build lookup maps ────────────────────────────────────────────────────────
  const imageByItem   = Object.fromEntries(
    (forwardImages ?? []).map(img => [img.item_id, img.url])
  );
  const profileById   = Object.fromEntries(
    (otherProfiles ?? []).map(p => [p.id, p])
  );
  const categoryById  = Object.fromEntries(
    (itemCategories ?? []).map(i => [i.id, i.category as ItemCategory])
  );

  // Last message and unread status per chat
  const lastMsgByChat: Record<string, { content: string; created_at: string; sender_id: string; is_system: boolean }> = {};
  const hasUnreadByChat: Record<string, boolean> = {};

  for (const msg of (allMessages ?? [])) {
    // Track last message (messages are DESC so first seen = latest)
    if (!lastMsgByChat[msg.chat_id]) {
      lastMsgByChat[msg.chat_id] = msg;
    }
  }

  // Compute unread per chat: non-self, non-system messages after last_read_at
  for (const chat of chats) {
    const isOwner    = chat.owner_id === user.id;
    const lastReadAt = isOwner ? chat.owner_last_read_at : chat.borrower_last_read_at;
    const hasUnread  = (allMessages ?? []).some(msg =>
      msg.chat_id    === chat.id &&
      msg.sender_id  !== user.id &&
      !msg.is_system &&
      (lastReadAt === null || msg.created_at > lastReadAt)
    );
    hasUnreadByChat[chat.id] = hasUnread;
  }

  return (
    <main className="min-h-screen bg-brand-bg pb-28">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-4">
        <h1 className="text-[22px] font-semibold text-brand-dark tracking-tight">Chats</h1>
      </div>

      {/* ── Chat list ────────────────────────────────────────────────────────── */}
      <div className="bg-brand-surface mx-4 rounded-2xl overflow-hidden">
        {chats.map((chat, i) => {
          const isOwner      = chat.owner_id === user.id;
          const otherUserId  = isOwner ? chat.borrower_id : chat.owner_id;
          const other        = profileById[otherUserId];
          const imageUrl     = imageByItem[chat.item_id];
          const category     = categoryById[chat.item_id];
          const lastMsg      = lastMsgByChat[chat.id];
          const hasUnread    = hasUnreadByChat[chat.id];
          // Phase 7: admin chats show "MirMari Support" as the conversation partner
          const isAdminChat  = (chat as { chat_type?: string }).chat_type === 'admin';

          const preview = lastMsg ? lastMsg.content : 'No messages yet';

          // Phase 8 §USER DISPLAY NAMES: show display_name if set, else district
          const otherLabel = isAdminChat
            ? 'MirMari Support'
            : (other as unknown as { display_name?: string | null } | undefined)?.display_name
              ? `${(other as unknown as { display_name: string }).display_name} · ${other?.district ?? 'Tbilisi'}`
              : (other?.district ?? 'Tbilisi');

          return (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className={`
                flex items-center gap-3 px-4 py-3.5 active:bg-brand-dark/5 transition-colors
                ${i < chats.length - 1 ? 'border-b border-brand-dark/5' : ''}
              `}
            >
              {/* Item thumbnail */}
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-brand-dark/10">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={category ? CATEGORY_LABELS[category as ItemCategory] : 'Item'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>

              {/* Chat info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  {/* Category + other party */}
                  <span className={`text-[14px] truncate ${hasUnread ? 'font-semibold text-brand-dark' : 'font-medium text-brand-dark/80'}`}>
                    {category ? CATEGORY_LABELS[category as ItemCategory] : 'Item'}
                  </span>
                  {/* Time */}
                  {lastMsg && (
                    <span className="text-[11px] text-brand-dark/35 flex-shrink-0">
                      {formatTime(lastMsg.created_at)}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-brand-dark/45 truncate mt-0.5">{otherLabel}</p>
                {/* Last message preview */}
                <p className={`text-[12px] truncate mt-0.5 ${
                  hasUnread ? 'text-brand-dark/70 font-medium' : 'text-brand-dark/40'
                } ${lastMsg?.is_system ? 'italic' : ''}`}>
                  {preview}
                </p>
              </div>

              {/* Unread indicator dot */}
              {hasUnread && (
                <span className="w-2 h-2 rounded-full bg-brand-accent flex-shrink-0" aria-label="Unread messages" />
              )}
            </Link>
          );
        })}
      </div>

      <BottomNav />
    </main>
  );
}
