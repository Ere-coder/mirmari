/**
 * ServiceWorkerRegistrar — registers /sw.js on mount.
 *
 * Must be a Client Component because navigator.serviceWorker is
 * browser-only. Placed in the root layout so it runs once globally.
 */
'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }, []);

  // Renders nothing — side-effect only
  return null;
}
