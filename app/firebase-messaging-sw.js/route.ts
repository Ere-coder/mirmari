/**
 * Route handler that serves /firebase-messaging-sw.js with Firebase config
 * injected from environment variables.
 *
 * Firebase requires the service worker to be served at exactly
 * /firebase-messaging-sw.js at the app root scope. A static public/ file
 * cannot access NEXT_PUBLIC_* env vars, so we serve it from a route handler
 * that interpolates the config at request time.
 *
 * Phase 8 §PUSH NOTIFICATIONS
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? '',
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? '',
  };

  const sw = `
// Firebase Messaging Service Worker — Phase 8 §PUSH NOTIFICATIONS
// Served dynamically so Firebase config env vars can be injected.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

// ── Background message handler ──────────────────────────────────────────────
// Called when a push message arrives while the app is in the background or closed.
// We show a notification manually so we control the click behaviour.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  const actionUrl = payload.data?.actionUrl ?? '/';

  self.registration.showNotification(title ?? 'MirMari', {
    body:  body ?? '',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data:  { actionUrl },
  });
});

// ── Notification click handler ───────────────────────────────────────────────
// When the user taps the notification, navigate to the action URL and focus
// the app if it is already open in a background tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl ?? '/';
  const fullUrl   = self.location.origin + actionUrl;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the target URL is already open, focus that tab
      for (const client of windowClients) {
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});
`;

  return new Response(sw, {
    headers: {
      'Content-Type':  'application/javascript; charset=utf-8',
      // No caching — config could change on redeploy
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      // Service workers require same-origin; this header confirms it
      'Service-Worker-Allowed': '/',
    },
  });
}
