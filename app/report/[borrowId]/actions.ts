/**
 * Server Actions for /report/[borrowId] — Phase 8 §PUSH NOTIFICATIONS
 *
 * Called from ReportForm after a successful submit_damage_report RPC.
 * Runs server-side to safely access SUPABASE_SERVICE_ROLE_KEY.
 */

'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyAdminDamageReport } from '@/lib/notifications/send';
import { CATEGORY_LABELS } from '@/lib/types';
import type { ItemCategory } from '@/lib/types';

// ── Notify all admins after submit_damage_report succeeds ─────────────────────
/**
 * Trigger 5 — Damage report submitted.
 * Fetches all admin user IDs + the item category, then fans out push
 * notifications to every admin.
 *
 * Spec: "New damage report submitted for [item category]. Review in admin dashboard."
 */
export async function notifyAdminsOfDamageReport(params: {
  itemId: string;
}) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return;

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // Fetch all admin user IDs
    const { data: admins } = await adminClient
      .from('profiles')
      .select('id')
      .eq('is_admin', true);

    if (!admins || admins.length === 0) return;

    // Fetch item category for notification body
    const { data: item } = await adminClient
      .from('items')
      .select('category')
      .eq('id', params.itemId)
      .single();

    const categoryLabel = CATEGORY_LABELS[(item?.category ?? 'tshirt_top') as ItemCategory] ?? 'item';

    await notifyAdminDamageReport({
      adminIds:      admins.map(a => a.id),
      categoryLabel,
    });
  } catch (err) {
    // Notification failures must never break the report flow
    console.warn('[notifyAdminsOfDamageReport]', err);
  }
}
