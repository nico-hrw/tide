import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {},
  webpack: (config, { dev }) => {
    const path = require('path');
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
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
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
