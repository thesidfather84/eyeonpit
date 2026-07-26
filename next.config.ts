import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: an unrelated package-lock.json in the parent
  // directory (C:\Users\bigsi) otherwise makes Next.js guess wrong.
  turbopack: {
    root: __dirname,
  },

  // Surfaces the deployed commit to the client (Settings > Export
  // Diagnostics, the recovery screen) so a bug report can be tied to an
  // exact build — Vercel sets VERCEL_GIT_COMMIT_SHA at build time, but
  // only NEXT_PUBLIC_-prefixed vars ship to the browser bundle.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  },

  // Vercel-readiness baseline security headers, plus a no-cache rule for
  // the offline service worker so operators always get a fresh worker on
  // deploy rather than a stale one silently serving an old app shell.
  // See plan.md §13.2.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
