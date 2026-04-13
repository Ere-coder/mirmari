/**
 * sendPushNotification — Phase 8 §PUSH NOTIFICATIONS
 *
 * Server-side utility (Next.js Server Action / server-only module).
 * Fetches the target user's FCM tokens from Supabase (using the service role key
 * to bypass RLS — fcm_tokens has no client SELECT policy by design) and sends
 * a push message via the Firebase Cloud Messaging HTTP v1 API.
 *
 * Called from:
 *   - ClaimButton server action wrapper  → notify item owner when claimed
 *   - ReturnButton server action wrapper → notify next user in queue (turn offered)
 *   - ReportForm server action wrapper   → notify admins on damage report
 *   - chat/[chatId]/page.tsx             → notify both parties on handover prompt
 *
 * Environment variables required (server-only, never NEXT_PUBLIC_*):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — full service account JSON (single-line string)
 *   SUPABASE_SERVICE_ROLE_KEY      — bypasses RLS to read fcm_tokens
 *
 * [ADDED: FCM server key needed] Both variables must be set in production.
 * The app degrades gracefully if they are absent — notifications are skipped
 * and a warning is logged, but no error is thrown to the caller.
 */

'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  /** Target user's UUID. All their FCM tokens will receive the message. */
  userId: string;
  /** Short title shown in the notification shade. */
  title: string;
  /** Body text of the notification. */
  body: string;
  /**
   * URL path the user is taken to when they tap the notification.
   * Relative to the app root (e.g. '/item/abc-123').
   */
  actionUrl: string;
}

// ── FCM HTTP v1 helpers ────────────────────────────────────────────────────────

/**
 * Obtains a short-lived OAuth2 access token from the Firebase service account
 * using the "google-auth-library"-style JWT grant flow, implemented manually
 * so we don't need an extra npm dependency.
 *
 * [ADDED: FCM server key needed] Requires FIREBASE_SERVICE_ACCOUNT_JSON.
 */
async function getFCMAccessToken(): Promise<string | null> {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping notification');
    return null;
  }

  let sa: {
    client_email: string;
    private_key: string;
    project_id: string;
  };

  try {
    sa = JSON.parse(saJson);
  } catch {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }

  // Build the JWT assertion for the Google OAuth2 token endpoint
  const now    = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));

  // Sign the JWT with the service account private key using WebCrypto
  // (available in Node 18+ and edge runtimes)
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signingInput   = `${header}.${payload}`;
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for an access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!tokenRes.ok) {
    console.warn('[FCM] Failed to obtain access token:', await tokenRes.text());
    return null;
  }

  const { access_token } = await tokenRes.json() as { access_token: string };
  return access_token;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Sends a push notification to all FCM tokens registered for the given user.
 * Safe to call from any server context (Server Action, Route Handler, page).
 *
 * Silently skips if:
 * - The user has no registered tokens (never granted permission).
 * - Environment variables are not set (dev environment / CI).
 * - The FCM HTTP request fails (network error, expired token).
 *
 * Never throws — notification failures must not break the user-facing flow.
 */
export async function sendPushNotification(payload: NotificationPayload): Promise<void> {
  const saJson        = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!saJson || !serviceRoleKey) {
    // [ADDED: FCM server key needed] Both vars must be set for notifications to work.
    // In development, this is expected — just skip silently.
    return;
  }

  // ── Read FCM tokens for the target user ──────────────────────────────────────
  // We use the service role client (bypasses RLS) because fcm_tokens has no
  // client SELECT policy — tokens should never be readable by other users.
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: tokenRows, error: tokenError } = await adminClient
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', payload.userId);

  if (tokenError || !tokenRows || tokenRows.length === 0) return;

  // ── Obtain FCM access token ──────────────────────────────────────────────────
  const accessToken = await getFCMAccessToken();
  if (!accessToken) return;

  let sa: { project_id: string };
  try {
    sa = JSON.parse(saJson);
  } catch {
    return;
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  // ── Send to each registered token ────────────────────────────────────────────
  // Tokens are per-device — a user may have multiple (phone + desktop browser etc.)
  const sends = tokenRows.map(({ token }) =>
    fetch(fcmUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          // Notification shown in the system notification shade (when app is background)
          notification: {
            title: payload.title,
            body:  payload.body,
          },
          // Data payload picked up by the SW for foreground handling + click routing
          data: {
            actionUrl: payload.actionUrl,
          },
          // Android-specific: high priority so the notification wakes the screen
          android: {
            priority: 'high',
            notification: { sound: 'default' },
          },
          // Web Push config: sets the click_action to the action URL
          webpush: {
            fcm_options: {
              link: payload.actionUrl,
            },
            notification: {
              icon:  '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
            },
          },
        },
      }),
    }).catch(err => console.warn('[FCM] send error for token:', err))
  );

  await Promise.allSettled(sends);
}

// ── Convenience wrappers for each notification type ───────────────────────────
// These encapsulate the message copy so it doesn't leak into component code.

/**
 * Trigger 4 — Claim received.
 * Sent to the item owner when someone claims their item.
 * Spec: "[district] user wants to borrow your [item category]. Open chat to arrange handover."
 */
export async function notifyClaimReceived(params: {
  ownerId:       string;
  borrowerDistrict: string;
  categoryLabel: string;
  chatId:        string;
}) {
  await sendPushNotification({
    userId:    params.ownerId,
    title:     'Someone wants to borrow your item',
    body:      `${params.borrowerDistrict} user wants to borrow your ${params.categoryLabel}. Open chat to arrange handover.`,
    actionUrl: `/chat/${params.chatId}`,
  });
}

/**
 * Trigger 1 — Queue turn offered.
 * Sent after advance_queue sets turn_offered_at for the next user.
 * Spec: "It's your turn to claim [item category]. You have 24 hours to confirm."
 */
export async function notifyTurnOffered(params: {
  userId:        string;
  categoryLabel: string;
  itemId:        string;
}) {
  await sendPushNotification({
    userId:    params.userId,
    title:     "It's your turn!",
    body:      `It's your turn to claim ${params.categoryLabel}. You have 24 hours to confirm.`,
    actionUrl: `/item/${params.itemId}`,
  });
}

/**
 * Trigger 2 — Queue turn missed.
 * Sent when the confirmation deadline passes and the user is skipped.
 * Spec: "You missed your turn for [item category]. You've been moved down the queue."
 * [ADDED: cron needed] This trigger requires a scheduled job (Supabase pg_cron or
 * Vercel Cron) to detect expired deadlines. The function is provided here but
 * must be called from a cron handler, not from a user action.
 */
export async function notifyTurnMissed(params: {
  userId:        string;
  categoryLabel: string;
  itemId:        string;
}) {
  await sendPushNotification({
    userId:    params.userId,
    title:     'You missed your turn',
    body:      `You missed your turn for ${params.categoryLabel}. You've been moved down the queue.`,
    actionUrl: `/item/${params.itemId}`,
  });
}

/**
 * Trigger 3 — Handover confirmation request.
 * Sent to both parties when ensure_handover_prompt inserts the 2-hour system message.
 * Spec: "Has the item been handed over? Please confirm in the app."
 */
export async function notifyHandoverPending(params: {
  userId: string;
  chatId: string;
}) {
  await sendPushNotification({
    userId:    params.userId,
    title:     'Confirm your handover',
    body:      'Has the item been handed over? Please confirm in the app.',
    actionUrl: `/chat/${params.chatId}`,
  });
}

/**
 * Trigger 5 — Damage report submitted (admin only).
 * Sent to all users with is_admin = true.
 * Spec: "New damage report submitted for [item category]. Review in admin dashboard."
 */
export async function notifyAdminDamageReport(params: {
  adminIds:      string[];
  categoryLabel: string;
}) {
  await Promise.allSettled(
    params.adminIds.map(adminId =>
      sendPushNotification({
        userId:    adminId,
        title:     'New damage report',
        body:      `New damage report submitted for ${params.categoryLabel}. Review in admin dashboard.`,
        actionUrl: '/admin',
      })
    )
  );
}
