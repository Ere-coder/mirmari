/**
 * Firebase client-side initialisation — Phase 8 §PUSH NOTIFICATIONS
 *
 * Exports a lazy-init helper that returns the Firebase Messaging instance.
 * Must only be called in browser contexts (inside useEffect or event handlers)
 * because Firebase Messaging requires the Web Push API, which is not available
 * during Next.js SSR.
 *
 * Environment variables required (set in .env.local):
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 *   NEXT_PUBLIC_FIREBASE_VAPID_KEY  — used by getToken() to identify this app
 *
 * [ADDED: FCM server key needed] The server-side notification sender (lib/notifications/send.ts)
 * also needs FIREBASE_SERVICE_ACCOUNT_JSON (a JSON string of the Firebase
 * Admin service account) stored as a secret env var (never NEXT_PUBLIC_*).
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';

// Firebase project config — all values are public (NEXT_PUBLIC_*) and safe to
// expose in browser bundles. The actual push-sending capability requires the
// server-side service account key, which is never sent to the client.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Returns the singleton Firebase App instance.
 * Safe to call multiple times — getApps() check prevents double-initialisation.
 */
function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Returns the Firebase Cloud Messaging instance for the browser.
 *
 * Must be called inside a browser-only context (useEffect / event handler).
 * Throws if called during SSR or if the browser does not support FCM.
 *
 * Usage:
 *   const messaging = getFirebaseMessaging();
 *   const token = await getToken(messaging, { vapidKey: '...' });
 */
export function getFirebaseMessaging(): Messaging {
  if (typeof window === 'undefined') {
    throw new Error('getFirebaseMessaging() must only be called in the browser.');
  }
  return getMessaging(getFirebaseApp());
}

/** VAPID key used when requesting an FCM token via getToken(). */
export const FCM_VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
