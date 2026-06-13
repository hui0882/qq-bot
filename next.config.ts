import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude data directory from compilation
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/data/**'],
    };
    return config;
  },
};

export default nextConfig;
