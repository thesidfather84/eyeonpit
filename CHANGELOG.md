# Changelog

All notable changes to EyeOnPit are recorded here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — `deep-eye-1.20-prototype` branch

### Added
- **Deep Eye 1.20 — first prototype foundation slice.** Not merged to `master`; a standalone branch proving Deep Eye can extend the app safely without changing live-counting behavior.
  - Additive, optional `CardEvent.source` field (`manual` / `voice` / `ai` / `import`) — defaults to `manual` for every event ever written before this field existed and for every event any current entry path writes today. No Dexie schema version bump; no existing call site changed. See `src/lib/counting-engine/eventSource.ts`.
  - **Diagnostic Center** — new read-only screen reachable from the existing live-screen menu (`≡` → Diagnostic Center), built on three new pure diagnostics under `src/lib/deepEye/`:
    - **Count integrity** (`countIntegrity.ts`) — cross-checks the authoritative running-count calculation against an independently-implemented recomputation of the same ledger.
    - **Ledger replay** (`ledgerReplay.ts`) — verifies per-shoe sequence-number contiguity, no orphaned events, and ordering idempotency.
    - **Investigation health** (`investigationHealth.ts`) — shoe/round numbering, re-validates every completed round against today's completion rules, surfaces legacy-ledger recovery ambiguities (read-only, never writes).
  - **Sanitized support package** (`supportPackage.ts`) — redacted export (names, free-text notes, and custom labels stripped; card ledger and diagnostics included) for support tickets, downloadable from the Diagnostic Center.
  - `docs/EYEONPIT_PROFESSIONAL_ARCHITECTURE.md` — repository-grounded architecture doc for this prototype: existing-system inventory, gap analysis, and what was deliberately not built yet (AI video recognition, voice engine, advantage scoring, cloud sync, and the rest of the deferred roadmap).
  - 34 new tests (`103/103` passing, up from a `69/69` baseline on `master`). Typecheck, lint, and production build all clean.
