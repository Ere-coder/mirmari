/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for catching potential issues during development
  reactStrictMode: true,

  // [ADDED: PWA headers] Custom headers to ensure the manifest and service worker
  // are served with correct content types and caching behavior
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
