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
      // NO LONGER NEEDED, 2026-08-21 — this route used to carry
      // COOP/COEP for crossOriginIsolated (first because whisper.cpp's
      // command.js ran in-process here, then briefly again because it was
      // assumed the isolated-origin Whisper <iframe> still needed it via
      // ancestor-chain propagation — see git history for both). Real,
      // direct testing proved that assumption wrong TOO:
      // `self.crossOriginIsolated` does not reliably propagate to a
      // cross-origin document nested in an <iframe> in this browser
      // regardless of COEP mode (tried both `credentialless` and
      // `require-corp` on this page, matched against the child's own
      // headers — neither made the iframe's `self.crossOriginIsolated`
      // read `true`; confirmed via real instrumentation posted back from
      // inside the iframe). The actual, durable fix was upstream, in
      // whisper.cpp's own build: `command.wasm` is now compiled WITHOUT
      // pthreads/SharedArrayBuffer at all (see the no-pthreads patch
      // referenced in whisperCppProvider.ts's own top-of-file doc
      // comment), so crossOriginIsolated is no longer required by
      // anything, on either side, in any configuration — this page needs
      // no special headers for Whisper, and neither does the isolated
      // origin itself anymore.
      //
      // Permissions-Policy, 2026-08-21 — real production bug found testing
      // the isolated-origin Whisper <iframe> end-to-end: with NO
      // Permissions-Policy header sent at all, the browser's IMPLICIT
      // default for "microphone" is `self` (same-origin only) — the
      // iframe's own `allow="microphone"` HTML attribute (set in
      // whisperCppProvider.ts's own `ensureSession()`) can only DELEGATE a
      // permission the top-level page's policy already grants for that
      // origin, it cannot override a same-origin-only default on its own.
      // Net effect: `getUserMedia()` inside the cross-origin Whisper
      // iframe hung forever — no error, no resolution, confirmed directly
      // (a manually constructed test iframe posted `whisper:start-phrase`
      // and never received ANY reply, not even a `whisper:error`, exactly
      // matching a permission prompt/request that can never actually
      // fire). Explicitly allowlisting the isolated Whisper origin here is
      // the fix — every other origin still defaults to `self`, unaffected.
      {
        source: "/lab/sherpa-voice-test",
        headers: [{ key: "Permissions-Policy", value: 'microphone=(self "https://whisper-static-lab.vercel.app")' }],
      },
    ];
  },
};

export default nextConfig;
