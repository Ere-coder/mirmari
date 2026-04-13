/**
 * Root Layout — wraps every page in the app.
 *
 * Responsibilities:
 * - Sets the HTML lang, viewport meta, and PWA-critical meta tags.
 * - Registers the service worker (client-side, via ServiceWorkerRegistrar).
 * - Renders the #app-shell wrapper that enforces the 480px column layout
 *   with safe area insets (spec §PWA AND LAYOUT).
 */
import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
// Phase 8 §PUSH NOTIFICATIONS — requests FCM permission + stores token on first load
import FCMInitializer from '@/components/FCMInitializer';

// ── PWA Metadata — used by browsers to show "Add to Home Screen" prompt ────
export const metadata: Metadata = {
  title: 'MirMari',
  description: 'infinite wardrobe',
  // [ADDED: PWA meta] manifest link and apple-touch icons enable home screen
  // installation on both Android (Chrome) and iOS (Safari).
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MirMari',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
};

// ── Viewport — separate from metadata per Next.js 14 requirement ─────────
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewport-fit=cover is required for safe-area-inset-* CSS env vars to work
  viewportFit: 'cover',
  themeColor: '#1E1420',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          [ADDED: iOS PWA meta tags] These meta tags enable true full-screen
          mode when the app is added to the iOS home screen. Without them,
          Safari renders a browser chrome overlay on top of the app.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {/* #app-shell enforces max-width 480px centered layout — spec §PWA AND LAYOUT */}
        <div id="app-shell">
          {children}
        </div>

        {/*
          ServiceWorkerRegistrar is a tiny Client Component that registers
          /public/sw.js. It must be a Client Component because
          navigator.serviceWorker is a browser-only API.
        */}
        {/* Registers /sw.js (app shell cache + offline) */}
        <ServiceWorkerRegistrar />

        {/*
          FCMInitializer is a client component that runs on every page after
          login. It requests notification permission and stores the FCM token
          in Supabase so the server can send push messages to this device.
          Phase 8 §PUSH NOTIFICATIONS
        */}
        <FCMInitializer />
      </body>
    </html>
  );
}
