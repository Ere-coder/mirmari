/**
 * Server Actions for /item/[id] — Phase 8 §PUSH NOTIFICATIONS
 *
 * These actions are called from client components after successful RPC calls.
 * They run server-side so they can safely access SUPABASE_SERVICE_ROLE_KEY
 * and FIREBASE_SERVICE_ACCOUNT_JSON without exposing them to the browser.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyClaimReceived, notifyTurnOffered } from '@/lib/notifications/send';
import { CATEGORY_LABELS } from '@/lib/types';

// ── Notify owner after claim_item succeeds ────────────────────────────────────
/**
 * Called by ClaimButton after a successful claim_item RPC.
 * Fetches the item owner + borrower district + category, then sends
 * a push notification to the owner.
 *
 * Trigger 4: "X user wants to borrow your [category]. Open chat to arrange handover."
 */
export async function notifyOwnerOfClaim(params: {
  borrowerId: string;
  itemId:     string;
  chatId:     string;
}) {
  try {
    const supabase = createClient();

    // Fetch item owner_id + category in one query
    const { data: item } = await supabase
      .from('items')
      .select('owner_id, category')
      .eq('id', params.itemId)
      .single();

    if (!item) return;

    // Fetch borrower's district (shown in the notification body)
    const { data: borrowerProfile } = await supabase
      .from('profiles')
      .select('district')
      .eq('id', params.borrowerId)
      .single();

    const categoryLabel = CATEGORY_LABELS[item.category as import('@/lib/types').ItemCategory] ?? item.category;

    await notifyClaimReceived({
      ownerId:          item.owner_id,
      borrowerDistrict: borrowerProfile?.district ?? 'Tbilisi',
      categoryLabel,
      chatId:           params.chatId,
    });
  } catch (err) {
    // Notification failures must never break the claim flow
    console.warn('[notifyOwnerOfClaim]', err);
  }
}

// ── Notify next-in-queue user after return_item succeeds ──────────────────────
/**
 * Called by ReturnButton after a successful return_item RPC when
 * next_state === 'next_in_queue'. Finds who just got their turn offered
 * and sends them a push notification.
 *
 * Trigger 1: "It's your turn to claim [category]. You have 24 hours to confirm."
 */
export async function notifyNextInQueue(params: {
  itemId: string;
}) {
  try {
    // Use service role to read the queue (advance_queue was called inside return_item,
    // so by the time we get here, turn_offered_at is already set for the next user).
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return;

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // Find the queue entry that was just offered a turn
    const { data: entry } = await adminClient
      .from('queue')
      .select('user_id')
      .eq('item_id', params.itemId)
      .eq('status', 'waiting')
      .not('turn_offered_at', 'is', null)
      .limit(1)
      .single();

    if (!entry) return;

    // Fetch item category for the notification body
    const { data: item } = await adminClient
      .from('items')
      .select('category')
      .eq('id', params.itemId)
      .single();

    const categoryLabel = CATEGORY_LABELS[(item?.category ?? 'tshirt_top') as import('@/lib/types').ItemCategory] ?? 'item';

    await notifyTurnOffered({
      userId:        entry.user_id,
      categoryLabel,
      itemId:        params.itemId,
    });
  } catch (err) {
    console.warn('[notifyNextInQueue]', err);
  }
}
