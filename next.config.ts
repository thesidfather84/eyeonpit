import type { NextConfig } from "next";
import { version as appVersion } from "./package.json";

const nextConfig: NextConfig = {
  // Pin the workspace root: an unrelated package-lock.json in the parent
  // directory (C:\Users\bigsi) otherwise makes Next.js guess wrong.
  turbopack: {
    root: __dirname,
  },

  // Surfaces build identity to the client (Settings > About, Export
  // Diagnostics, the recovery screen) so desktop, mobile, and an installed
  // PWA can all be confirmed to be running the same deploy — Vercel sets
  // VERCEL_GIT_COMMIT_SHA at build time, but only NEXT_PUBLIC_-prefixed
  // vars ship to the browser bundle. Build date is captured once, here, at
  // build time — evaluating Date.now() at request/render time would give
  // every visitor a different value.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
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
      // REMOVED 2026-08-21: this route used to need crossOriginIsolated
      // (COOP/COEP) because whisper.cpp's compiled command.js — loaded
      // in-process, directly into THIS page — used SharedArrayBuffer-backed
      // worker threads. That architecture is gone (see
      // whisperCppProvider.ts's own top-of-file ARCHITECTURE doc comment):
      // the WASM runtime now lives entirely on its own isolated origin
      // (whisper-static-lab.vercel.app, embedded via <iframe>), which
      // carries its OWN COOP/COEP headers for its OWN crossOriginIsolated
      // need. This page no longer runs any SharedArrayBuffer-dependent code
      // itself. Keeping COEP here was actively HARMFUL, not just
      // unnecessary: a page with COEP enabled additionally enforces
      // Cross-Origin-Resource-Policy on every iframe it embeds, and
      // whisper-static-lab's own CORP: same-origin (needed for its WASM
      // Worker's same-origin requirement — see that project's own
      // vercel.json) made the browser silently refuse to load the Whisper
      // iframe at all — confirmed directly: the iframe never sent
      // `whisper:ready`, reproducing exactly the real production failure
      // this fix resolves.
    ];
  },
};

export default nextConfig;
