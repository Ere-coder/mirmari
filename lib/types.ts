/**
 * Shared TypeScript types for Phases 2–7.
 *
 * These mirror the Supabase database enums and table column types defined in
 * schema-phase2.sql through schema-phase7.sql. Keep in sync if the schema changes.
 *
 * Imported by: components/SwipeBrowser, components/UploadForm (via app/upload),
 * app/home, app/item/[id], app/credits, app/profile/[id], app/chats, app/chat/[chatId],
 * app/insurance/[borrowId], app/report/[borrowId], app/admin.
 */

// ── Enums (mirror database enums) ─────────────────────────────────────────────

export type ItemCategory =
  | 'tank_top'
  | 'tshirt_top'
  | 'shirt_blouse'
  | 'shorts'
  | 'skirt'
  | 'pants_jeans';

export type ItemStatus = 'available' | 'borrowed' | 'unavailable';

export type ImageLayer = 'original' | 'condition' | 'experience';

export type PrimarySize = 'XS' | 'S' | 'M' | 'L' | 'XL';

// ── Fit tags ───────────────────────────────────────────────────────────────────
// Stored as text[] in the items table. Defined here as a constant so the
// UploadForm and any filter UI share the same source of truth.

export const FIT_TAGS = [
  'tight',
  'regular',
  'oversized',
  'stretchy',
  'non-stretch',
  'cropped',
  'long',
] as const;

export type FitTag = (typeof FIT_TAGS)[number];

// ── Category display labels ────────────────────────────────────────────────────
// Used by UploadForm dropdowns and SwipeBrowser overlay to show human-readable names.

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  tank_top:     'Tank Top',
  tshirt_top:   'T-Shirt',
  shirt_blouse: 'Shirt / Blouse',
  shorts:       'Shorts',
  skirt:        'Skirt',
  pants_jeans:  'Pants / Jeans',
};

// ── Table row shapes ──────────────────────────────────────────────────────────

/** Raw row from the items table. */
export interface Item {
  id: string;
  owner_id: string;
  category: ItemCategory;
  credit_value: number;
  primary_size: PrimarySize;
  numeric_size: number | null;
  fit_description: string;
  fit_tags: string[] | null;
  status: ItemStatus;
  created_at: string;
}

/** Raw row from the item_images table. */
export interface ItemImage {
  id: string;
  item_id: string;
  owner_id: string;
  url: string;
  layer: ImageLayer;
  is_forward: boolean;
  created_at: string;
}

// ── Phase 3 enums ─────────────────────────────────────────────────────────────

export type CreditTransactionType = 'earned' | 'spent' | 'purchased' | 'reimbursed';

export type BorrowStatus = 'pending' | 'active' | 'returned';

// ── Claim RPC result ──────────────────────────────────────────────────────────
// Mirrors the JSONB returned by the claim_item(p_item_id, p_borrower_id) RPC.
// Phase 6: success includes chat_id for navigation.
// Phase 7: success also includes borrow_id and insurance_amount so ClaimButton
//          can redirect to /insurance/[borrowId] instead of directly to chat.

export type ClaimResult =
  | { success: true; chat_id: string; borrow_id: string; insurance_amount: number }
  | { success: false; reason: 'item_unavailable' | 'cannot_claim_own_item' | 'not_eligible' | 'insufficient_credits' | 'unauthorized' | 'item_reclaiming' };

// ── Phase 4: Queue types ───────────────────────────────────────────────────────

/** Lifecycle state for a single queue entry (mirrors queue_status DB enum). */
export type QueueStatus = 'waiting' | 'skipped' | 'cancelled';

/** Row shape for the queue table. */
export interface QueueEntry {
  id: string;
  item_id: string;
  user_id: string;
  /** 1-based position in the active waiting queue. */
  position: number;
  status: QueueStatus;
  /** Credits soft-locked at join time. 0 when released (cancelled/skipped). */
  reserved_credits: number;
  /** Set by advance_queue when it is this user's turn (null otherwise). */
  turn_offered_at: string | null;
  /** turn_offered_at + 24h. User must confirm before this timestamp. */
  confirmation_deadline: string | null;
  created_at: string;
}

/** Return type of the join_queue(p_item_id, p_user_id) RPC. */
export type JoinQueueResult =
  | { success: true; position: number }
  | {
      success: false;
      reason:
        | 'unauthorized'
        | 'item_not_found'
        | 'item_not_borrowed'
        | 'cannot_queue_own_item'
        | 'not_eligible'
        | 'already_in_queue'
        | 'insufficient_credits';
    };

/** Return type of the cancel_queue(p_item_id, p_user_id) RPC. */
export type CancelQueueResult =
  | { success: true }
  | { success: false; reason: 'unauthorized' | 'not_in_queue' };

/**
 * Return type of the confirm_queue_claim(p_item_id, p_user_id) RPC.
 * Phase 6 patch: success now includes chat_id so QueuePanel can navigate
 * to the new chatroom (mirrors what claim_item returns for direct borrows).
 */
export type ConfirmQueueClaimResult =
  | { success: true; chat_id: string }
  | {
      success: false;
      reason:
        | 'unauthorized'
        | 'item_not_found'
        | 'turn_not_offered'
        | 'deadline_expired'
        | 'insufficient_credits';
    };

// ── Phase 5: Return and reclaim types ────────────────────────────────────────

/**
 * Return type of the return_item(p_item_id, p_borrower_id) RPC.
 * next_state tells the UI which post-return message to display.
 */
export type ReturnItemResult =
  | {
      success: true;
      /** 'next_in_queue'    — advance_queue was called; next user offered the item.
       *  'reclaim_complete' — queue drained, reclaiming cleared; item back to owner.
       *  'available'        — queue empty, not reclaiming; item open for new claims. */
      next_state: 'next_in_queue' | 'reclaim_complete' | 'available';
    }
  | {
      success: false;
      reason: 'unauthorized' | 'item_not_found' | 'not_active_borrower';
    };

/** Return type of the reclaim_item(p_item_id, p_owner_id) RPC. */
export type ReclaimItemResult =
  | { success: true }
  | {
      success: false;
      reason:
        | 'unauthorized'
        | 'item_not_found'
        | 'not_owner'
        | 'item_unavailable'
        | 'already_reclaiming';
    };

// ── Phase 6: Chat / message / handover types ──────────────────────────────────

/**
 * Phase 7 — chat_type enum.
 * 'handover' — standard borrower ↔ giver coordination chat.
 * 'admin'    — MirMari support chat created by submit_damage_report.
 */
export type ChatType = 'handover' | 'admin';

/** Row shape for the chats table. */
export interface Chat {
  id: string;
  borrow_id: string;
  item_id: string;
  owner_id: string;
  borrower_id: string;
  /** Phase 7: distinguishes handover chats from admin support chats. */
  chat_type: ChatType;
  /** ISO timestamp of the last time the owner read the chat. Null = never read. */
  owner_last_read_at: string | null;
  /** ISO timestamp of the last time the borrower read the chat. Null = never read. */
  borrower_last_read_at: string | null;
  created_at: string;
}

/** Row shape for the messages table. */
export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  /** true = system-generated message (e.g. handover prompts); false = user message. */
  is_system: boolean;
  created_at: string;
}

/** Row shape for the handover_confirmations table. */
export interface HandoverConfirmation {
  id: string;
  borrow_id: string;
  confirmed_by_borrower: boolean;
  confirmed_by_owner: boolean;
  borrower_confirmed_at: string | null;
  owner_confirmed_at: string | null;
  /** Set when both sides have confirmed. Null until then. */
  fully_confirmed_at: string | null;
}

/**
 * Return type of the confirm_handover(p_borrow_id, p_user_id, p_role) RPC.
 * Called by HandoverConfirmation client component.
 *
 * result values:
 *   'partial_confirmed'      — this side confirmed, waiting for the other
 *   'fully_confirmed'        — both sides just confirmed; borrow is now 'active'
 *   'already_fully_confirmed'— both sides were already confirmed (idempotent call)
 */
export type ConfirmHandoverResult =
  | { success: true; result: 'partial_confirmed' | 'fully_confirmed' | 'already_fully_confirmed' }
  | { success: false; reason: 'unauthorized' | 'borrow_not_found' | 'invalid_role' | 'role_mismatch' | 'confirmation_not_found' };

/**
 * Return type of the get_unread_count() RPC.
 * Returns the total number of unread messages across all the caller's chats.
 */
export type UnreadCountResult = number;

// ── Phase 7: Damage reporting, insurance, and reimbursement types ────────────

export type DamageReportStatus = 'pending' | 'repairable' | 'irreversible';
export type InsurancePaymentStatus = 'pending' | 'paid';

/** Row shape for the damage_reports table. */
export interface DamageReport {
  id: string;
  borrow_id: string;
  item_id: string;
  reporter_id: string;
  description: string;
  status: DamageReportStatus;
  admin_note: string | null;
  admin_chat_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Row shape for the insurance_payments table. */
export interface InsurancePayment {
  id: string;
  borrow_id: string;
  borrower_id: string;
  amount: number;
  status: InsurancePaymentStatus;
  paid_at: string | null;
  created_at: string;
}

/** Row shape for the reimbursements table. */
export interface Reimbursement {
  id: string;
  item_id: string;
  report_id: string;
  owner_id: string;
  amount: number;
  queue_snapshot: Record<string, unknown>;
  created_at: string;
}

/**
 * Return type of the pay_insurance(p_borrow_id, p_borrower_id) RPC.
 * On success, chat_id is the handover chat for this borrow.
 */
export type PayInsuranceResult =
  | { success: true; chat_id: string }
  | {
      success: false;
      reason:
        | 'unauthorized'
        | 'borrow_not_found'
        | 'not_borrower'
        | 'insurance_not_found'
        | 'already_paid'
        | 'chat_not_found';
    };

/**
 * Return type of the submit_damage_report(p_borrow_id, p_reporter_id, p_description, p_image_urls) RPC.
 * On success, admin_chat_id is the newly created MirMari Support chat.
 */
export type SubmitDamageReportResult =
  | { success: true; admin_chat_id: string; report_id: string }
  | {
      success: false;
      reason:
        | 'unauthorized'
        | 'borrow_not_found'
        | 'not_participant'
        | 'already_reported'
        | 'admin_not_found';
    };

/**
 * Return type of classify_repairable / classify_irreversible RPCs.
 * Called by admin DamageReportCard.
 */
export type ClassifyResult =
  | { success: true }
  | {
      success: false;
      reason:
        | 'unauthorized'
        | 'not_admin'
        | 'report_not_found'
        | 'already_classified';
    };

// ── Browse view shape ──────────────────────────────────────────────────────────
// This is the shape expected by SwipeBrowser.
// The server component at /home joins items → profiles and item_images,
// then maps to this flat structure before passing it as a prop.

export interface BrowseItem {
  id: string;
  owner_id: string;
  category: ItemCategory;
  credit_value: number;
  primary_size: PrimarySize;
  numeric_size: number | null;
  fit_description: string;
  fit_tags: string[] | null;
  // District joined from profiles via owner_id — shown in the browse overlay.
  district: string;
  // All images for this item. SwipeBrowser splits them into forward/deep.
  images: {
    id: string;
    url: string;
    is_forward: boolean;
    layer: ImageLayer;
  }[];
}
