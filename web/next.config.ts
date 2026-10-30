import path from "path";
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request, url }) => {
          return (
            (request.mode === "navigate" || url.pathname === "/") &&
            !url.pathname.startsWith("/api/")
          );
        },
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-cache",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
          networkTimeoutSeconds: 3,
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack: (config, { dev }) => {
    config.resolve.alias['yjs'] = path.resolve(__dirname, 'node_modules/yjs');

    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: [
          '**/node_modules',
          '**/.next',
          '**/cloud',
          '**/data',
          '**/.git',
          '**/*.tmp',
          '**/*.log',
          '**/*.txt'
        ],
      }
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https: http: wss: ws: *; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const backendPort = process.env.BACKEND_PORT || process.env.PORT_BACKEND || '8080';
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${backendPort}/api/:path*`,
      },
      {
        source: '/track',
        destination: 'http://localhost:3001/track',
      },
      {
        source: '/track/:path*',
        destination: 'http://localhost:3001/track/:path*',
      },
    ];
  },
};

export default withPWA(nextConfig);
