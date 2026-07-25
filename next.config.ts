import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: an unrelated package-lock.json in the parent
  // directory (C:\Users\bigsi) otherwise makes Next.js guess wrong.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
