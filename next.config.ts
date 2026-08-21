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
      // Cross-origin isolation, scoped ONLY to the Voice Lab route — real
      // requirement discovered 2026-08-20 verifying the Whisper (whisper.cpp
      // command.wasm) provider in a real browser: its compiled command.js
      // uses SharedArrayBuffer-backed worker threads and throws
      // "SharedArrayBuffer transfer requires self.crossOriginIsolated" during
      // its own preRun without these headers. `credentialless` (not
      // `require-corp`) is used for COEP specifically because production
      // Whisper/Sherpa assets are served cross-origin from Vercel Blob
      // (*.public.blob.vercel-storage.com) — `require-corp` would additionally
      // require every one of those responses to carry its own
      // Cross-Origin-Resource-Policy header, which Vercel Blob's public-read
      // URLs are not guaranteed to send; `credentialless` achieves
      // `crossOriginIsolated: true` without that cross-origin dependency. Never
      // applied to any other route — every other page's cross-origin embeds
      // (fonts, images, etc.) are completely unaffected.
      {
        source: "/lab/sherpa-voice-test",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
