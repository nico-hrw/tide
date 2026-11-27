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
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: {
          cacheName: "apis",
        },
      },
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
  experimental: {
    proxyClientMaxBodySize: '250mb',
    proxyTimeout: 300_000,
  },
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
    const prodConnectOrigins = new Set<string>([
      "'self'",
      "https://go-tide.app",
      "wss://go-tide.app",
      "https://www.go-tide.app",
      "wss://www.go-tide.app",
      "https://hrw.rocks",
    ]);
    if (process.env.NEXT_PUBLIC_API_URL) {
      try {
        const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
        prodConnectOrigins.add(apiOrigin);
        if (apiOrigin.startsWith("https://")) {
          prodConnectOrigins.add(apiOrigin.replace(/^https:/, "wss:"));
        } else if (apiOrigin.startsWith("http://")) {
          prodConnectOrigins.add(apiOrigin.replace(/^http:/, "ws:"));
        }
      } catch {
        // Ignore malformed NEXT_PUBLIC_API_URL
      }
    }
    const connectSrc =
      process.env.NODE_ENV === "development"
        ? "'self' https: http: wss: ws:"
        : Array.from(prodConnectOrigins).join(" ");

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // The dev server's hot reload needs eval; the production policy stays strict.
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://media.githubusercontent.com https://objects.githubusercontent.com; font-src 'self' data:; connect-src ${connectSrc}; object-src 'none'; base-uri 'self'; frame-ancestors 'none';`,
          },
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
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
