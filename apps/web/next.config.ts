import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  experimental: {
    preloadEntriesOnStart: false,
    serverComponentsHmrCache: true,
  },
};

export default nextConfig;
