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
      // RESTORED 2026-08-21 after being briefly (and INCORRECTLY) removed
      // earlier the same day. The mistaken reasoning: since whisper.cpp's
      // WASM runtime no longer runs in-process on THIS page (it moved to
      // its own isolated origin, whisper-static-lab.vercel.app, embedded
      // via <iframe> — see whisperCppProvider.ts's own ARCHITECTURE doc
      // comment), it looked like this page no longer needed
      // crossOriginIsolated itself. Real, direct testing proved that
      // reasoning wrong: `self.crossOriginIsolated` inside a NESTED iframe
      // requires COEP on the ENTIRE ancestor chain, not just the iframe's
      // own document — removing COEP here made the Whisper iframe's own
      // crossOriginIsolated read `false` despite its own COOP/COEP headers,
      // silently breaking its SharedArrayBuffer-backed pthread worker pool
      // (module init hung forever on `debug:awaiting-module`, confirmed via
      // real instrumentation). The ACTUAL bug removing this had been meant
      // to fix — whisper-static-lab's own `Cross-Origin-Resource-Policy:
      // same-origin` blocking this COEP-enabled page from embedding it at
      // all — is fixed on the OTHER side instead: that project's
      // vercel.json now sends `Cross-Origin-Resource-Policy: cross-origin`,
      // which satisfies COEP's requirement without EyeOnPit giving up its
      // own COEP. Both fixes are required together, verified end-to-end in
      // a real browser: real transcription, zero wake phrase.
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
