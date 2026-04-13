/**
 * FCMInitializer — Phase 8 §PUSH NOTIFICATIONS
 *
 * Client-only component placed in the root layout. On mount:
 *   1. Checks if the user is authenticated (skips silently if not).
 *   2. Requests notification permission from the browser.
 *   3. If granted, retrieves the FCM registration token.
 *   4. Upserts the token into the fcm_tokens table via Supabase.
 *
 * Also registers /firebase-messaging-sw.js so FCM can deliver background
 * push notifications when the app tab is not in focus.
 *
 * Renders nothing — this is a side-effect-only component.
 *
 * Placement: app/layout.tsx (renders on every page, runs once per session).
 *
 * Notes:
 * - Permission request is deferred to useEffect so it never runs during SSR.
 * - The FCM token is tied to this browser / device. Multiple devices → multiple rows.
 * - The UNIQUE(user_id, token) constraint on fcm_tokens prevents duplicates.
 * - Tokens are not deleted on page unload; they persist until the user logs out
 *   or the browser revokes the push subscription. For a production app you would
 *   also call deleteFCMToken() on sign-out.
 */
'use client';

import { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging, FCM_VAPID_KEY } from '@/lib/firebase/client';
import { createClient } from '@/lib/supabase/client';

export default function FCMInitializer() {
  useEffect(() => {
    // Guard: FCM requires a secure context (HTTPS or localhost) and service workers.
    // Skip silently in environments where this is not available (e.g. CI, old browsers).
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    async function initFCM() {
      try {
        const supabase = createClient();

        // Only proceed if a user session exists — tokens are user-scoped.
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // ── Register the FCM service worker ──────────────────────────────────
        // Firebase requires the SW to be at /firebase-messaging-sw.js (exact path).
        // We register it here so it's always available before getToken() is called.
        const swRegistration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js',
          { scope: '/' }
        );

        // ── Request notification permission ───────────────────────────────────
        // Browsers show a native permission prompt if status is 'default'.
        // We never ask again if the user previously denied (status === 'denied').
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // ── Get FCM registration token ────────────────────────────────────────
        // getToken links this browser to the FCM project via the VAPID key.
        // The returned token is sent to the server to deliver push messages.
        const messaging = getFirebaseMessaging();
        const token = await getToken(messaging, {
          vapidKey:            FCM_VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        });

        if (!token) return;

        // ── Store token in Supabase ───────────────────────────────────────────
        // UNIQUE(user_id, token) means this upsert is idempotent — safe to call
        // on every page load. The RLS policy ensures users can only write their own rows.
        await supabase.from('fcm_tokens').upsert(
          { user_id: user.id, token },
          { onConflict: 'user_id,token', ignoreDuplicates: true }
        );
      } catch (err) {
        // FCM init failures are non-fatal — the app works without push notifications.
        console.warn('[FCMInitializer] init error:', err);
      }
    }

    initFCM();
  }, []); // Run once on mount

  return null;
}
