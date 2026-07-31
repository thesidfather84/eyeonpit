# EyeOnPit Professional Architecture — Deep Eye 1.20 Prototype

**Status:** First prototype, `deep-eye-1.20-prototype` branch. Not merged to `master`. Not deployed.
**Scope:** Repository-grounded architecture for Deep Eye's foundation slice — event-source metadata, the Diagnostic Center, and the three read-only diagnostics it runs. Everything in this document describes what actually exists in this branch today, not an aspirational future state.

---

## 1. Existing-system inventory (as of `master@541fd9d`)

This is what Deep Eye extends. Nothing listed here was changed by this prototype except where explicitly marked **[additive change]**.

### 1.1 Counting engine — `src/lib/counting-engine/`
- **`types.ts`** — `CardEvent`, the sole unit of record for an exposed card: `id`, `investigationId`, `shoeNumber`, `roundId`, `sequence`, `targetType`, `targetId`, `rank`, `status` (`active`/`undone`/`void`), `createdAt`. **[additive change: `source?: CardEventSource` added — see §3.]**
- **`ledger.ts`** — `createCardEvent()` assigns the next per-shoe `sequence` (`max(existing) + 1`, never reused, never reset except at a shoe boundary) and builds a new event. `activeEventsInOrder()` (in `calculateCounts.ts`) dedupes by `id`, keeps only `active` status, sorts by `sequence` — the one place "what actually counts right now" is decided.
- **`calculateCounts.ts`** — `calculateCountSnapshot(events, decksInPlay)` is the single authoritative running/true-count calculation for all four systems (Hi-Lo, KO, Zen, Omega II) at once, in one pass. No count is ever cached; every UI surface (`CountSummaryPanel`, reports, analysis) recomputes from `cardEvents` on every render.
- **`countTags.ts`** — published per-system tag values, KO's unbalanced Initial Running Count.
- **`calculateTrueCount.ts`** — true-count conversion (balanced systems only; KO returns `null`, never `0`) and the one display-rounding function.
- **`migration.ts`** — `recoverLegacyLedger()` reconstructs a `CardEvent[]` for investigations recorded before the ledger table existed, from structured round data where it survives and from event-log text where it doesn't (flagging every text-recovered target as an `ambiguity`). Read/build only; writing the recovered events is `cardEvents.ts`'s `ensureLegacyLedger()`, gated to run at most once per investigation.

### 1.2 Persistence — `src/lib/db/`
- **`schema.ts`** — Dexie (`eyeonpit` database), two tables: `investigations` (keyed `localId`) and `cardEvents` (keyed `id`, compound-indexed on `[investigationId+shoeNumber]`). Two schema versions on disk today; v2 added `cardEvents` as a purely additive table.
- **`repositories/cardEvents.ts`** — `addCardToRound()` writes a round's display-array mutation and its `CardEvent` in one Dexie transaction — neither can exist without the other. `undoCardAdd`/`redoCardAdd` flip a specific event's `status` and restore the paired round snapshot, also transactionally. Event rows are never deleted, only status-transitioned.
- **`repositories/investigations.ts`** — round/seat/wager/shoe lifecycle: `completeRound`, `advanceRound`, `occupySeat`, `markSeatEmpty`, `linkSeats`, `applyBetToLinkedSpots`, `pauseInvestigation`/`resumeInvestigation`, `addOperatorNote`, and more.
- **`normalizeInvestigation.ts`** — the one place every persisted `Investigation` is read through; accepts `unknown`, always returns a fully-formed value, never throws. This is the existing precedent for "old data must degrade gracefully," and Deep Eye's additive fields follow the same spirit without needing a normalizer of their own (see §3).

### 1.3 Live workflow — `src/components/live/`
`LiveScreen` orchestrates `LiveHeader`, `CountSummaryPanel`, `TableMap` (`SeatTilesRow` + `DealerTile`), `RoundControlsRow` (Done/Next/Undo), `CardEntryPad` (the 5×2 keypad), `QuickBetPanel`, `PlayerActionsRow` (Double/Split/Insurance/Surrender), `HandStatusLine`, and `LiveMenu` (History/Reports/Export/Settings/Help, plus New Shoe, Misdeal, End Investigation). `InvestigationContext` is the single source of truth for all of it — every handler above ultimately calls into `addCard`, `mutate`, or a repository function, never a component-local mutation.

### 1.4 Reports / export
- **`lib/export/toJson.ts`** — `investigationToJson()` bundles the full `Investigation` plus its complete `CardEvent[]` (so a re-import never needs to infer counts). `EXPORT_SCHEMA_VERSION` versions this envelope independently of `Investigation.schemaVersion`.
- **`lib/diagnostics/logger.ts`** — `diagnostics.debug/info/warn/error/critical()`, an in-memory ring buffer plus Dexie-persisted warn+ entries, already used inside `addCard` itself to log every count transition. This is the app-log utility; Deep Eye's diagnostics are a different thing (data-integrity checks against the ledger), described in §4, and deliberately don't write through this logger — they're pure read functions, not app events.

### 1.5 Tests
69 tests across 9 files on `master`, all passing (baseline recorded in §6). Coverage spans the counting engine, the legacy-recovery migration, the card-event repository (including a fake-IndexedDB-backed integration test), and one full-stack integration test asserting the live React wiring refreshes the visible count after a real card tap.

---

## 2. Gap analysis

What the existing system has no way to answer today, absent this prototype:

1. **"Is the count I'm looking at actually correct?"** — `calculateCountSnapshot` is trusted implicitly. There was no second, independently-implemented code path to cross-check it against, and no way to surface a structural ledger problem (a sequence gap, an orphaned event, a duplicate id from a bad import) to an operator or investigator before it silently produced a wrong-looking count.
2. **"Where did this card come from?"** — every `CardEvent` is indistinguishable by origin. That's fine while touch entry is the only entry path, but it's a real gap for any future entry path (voice, AI-assisted, or a bulk import) that needs to be auditable separately from what an operator tapped.
3. **"Can I hand this investigation to support without handing them a player's or dealer's name?"** — `downloadInvestigationJson()` exports everything, unredacted, by design (it's meant to be a faithful, re-importable record). There was no lighter-weight, redacted bundle meant specifically for a support ticket.
4. **"Did legacy recovery leave anything uncertain?"** — `recoverLegacyLedger()` already computes an `ambiguities` list, but nothing in the UI ever shows it to anyone; it's silently discarded by every current call site.

Deep Eye's first slice closes gaps 1, 2, and 3 directly, and surfaces the data already sitting behind gap 4.

---

## 3. Additive event-source metadata

**Change:** `CardEvent` gained one new optional field.

```ts
export type CardEventSource = "manual" | "voice" | "ai" | "import";

export interface CardEvent {
  // ...every existing field, unchanged...
  source?: CardEventSource;
}
```

**Why this is genuinely additive, not a migration:**
- Dexie's schema strings (`schema.ts`) only declare *indexed* fields. `source` is not indexed, so the table definition — `"id, investigationId, [investigationId+shoeNumber], roundId, status"` — did not change, and the Dexie version number was **not** bumped. Every `CardEvent` row already on disk is untouched; it simply has no `source` property, exactly as it had no `source` property before this branch existed.
- `createCardEvent()` (`ledger.ts`) sets `source: input.source ?? "manual"`. Every existing caller — `CardEntryPad`'s keypad tap, ultimately `addCardToRound()` in `cardEvents.ts` — passes no `source` at all, so every event written by the shipped app today is stamped `"manual"`, identically to before this change in every observable way except the one new property.
- `cardEventSource(event)` (new file: `lib/counting-engine/eventSource.ts`) is the one function anything should ever call to read it: `event.source ?? "manual"`. A pre-existing event with no `source` property and a new event explicitly written as `"manual"` are indistinguishable through this function, by design.
- **Nothing reads `source` to gate or alter counting behavior.** `calculateCountSnapshot` counts every active event identically regardless of source. This field is metadata for provenance/audit only, in this prototype.

This is the hook a future voice/AI/import entry path plugs into later — it requires no further schema change, only a new caller that passes `source: "voice"` (etc.) through the same `addCard()` → `addCardToRound()` → `createCardEvent()` path every existing card already travels. **No such caller exists yet in this branch** — voice and AI entry are explicitly out of scope for this prototype (see the "Do not implement yet" list, faithfully respected: this is the metadata design and plumbing, not the feature).

---

## 4. Diagnostic Center

A new `Stethoscope`-icon item in the existing `LiveMenu` overlay list (`History / Reports / Export / Diagnostic Center / Settings / Help`) — same `BottomSheet` pattern as every other menu item, so it costs the live screen nothing structurally. Reachable, closeable, and dismissible exactly like Reports or Settings already are.

It reads `investigation` and `cardEvents` directly off `useInvestigationContext()` — the identical live state `CountSummaryPanel` renders from — recomputes three reports on every open (cheap, pure, synchronous), and renders each as a pass/warn/fail checklist.

### 4.1 Count-integrity diagnostic (`lib/deepEye/countIntegrity.ts`)
Recomputes every counting system's running total via a second, independently-written implementation (`reduce()` over a fresh accumulator, not `calculateCountSnapshot`'s mutated-object loop) built from the same already-unit-tested primitives (`tagValue`, `initialRunningCount`). If the authoritative function and the independent recompute ever disagree, that's a real bug in one of the two code paths, not a data problem — this diagnostic exists to catch exactly that class of regression before it reaches an operator's screen. Also validates: decks-remaining and true-count reproduce from the same inputs; no two events share an `id` (impossible from a live Dexie read — this only ever fires on data that arrived by another path, e.g. an import); every `rank` is a recognized value.

### 4.2 Ledger replay verification (`lib/deepEye/ledgerReplay.ts`)
Checks the ledger's own internal ordering, independent of what it counts to: per shoe, the full set of sequence numbers (active *and* undone together — an undone event still permanently consumes its slot) must be exactly `{1..N}` with no gap or repeat. Also checks every event's `roundId` resolves to a real round, every `status` is a recognized value, and that `activeEventsInOrder()` is a stable fixed point under a second pass.

### 4.3 Investigation health summary (`lib/deepEye/investigationHealth.ts`)
Structural checks over the `Investigation` as a whole: shoe numbers and (per shoe) round numbers contiguous from 1; every round marked `completed` still passes **today's** `canCompleteRound()` — reusing that exact existing function, not a reimplementation of its rules, so this can never drift from the live completion logic. Also previews (read-only — never calls `ensureLegacyLedger()`, never writes) whether `recoverLegacyLedger()` would flag any ambiguities, closing gap 4 from §2. Returns a small summary (shoe/round/occupied-seat/active-card/note counts) alongside the checklist.

### 4.4 Sanitized support package (`lib/deepEye/supportPackage.ts`)
`buildSupportPackage()` mirrors `investigationToJson()`'s shape (full `CardEvent[]` included, because that's what's needed to reproduce a counting bug) but redacts `casino`, `dealerName`, `operatorName`, `investigationLabel`, `executiveSummary`, `surveillanceMemo` to `null`, replaces `operatorNotes` with a count only (never the text), and replaces player-group labels with stable `"Group 1"/"Group 2"` names while preserving the group **ids** in `seatPlayerGroups` — so which seats were linked together is still visible to support, without any name attached to that fact. The redaction is a real deletion from a cloned object (`delete clone.casino`, etc.), not merely a TypeScript type claiming a field is absent while the runtime object still carries it — verified directly in tests (`supportPackage.test.ts` asserts the original name strings are absent from the serialized JSON, not just that the typed field is `null`). Bundles all three diagnostic reports above so a support ticket includes exactly what the operator would have seen in the Diagnostic Center. `downloadSupportPackage()` triggers a local browser download — no network call, nothing sent anywhere.

---

## 5. Backward compatibility

- **No Dexie version bump.** The `source` field is unindexed; the schema string is unchanged. An investigation created on `master` today opens identically on this branch tomorrow.
- **No existing call site changed its arguments.** `CardEntryPad` → `addCard()` → `addCardToRound()` is byte-for-byte the same call it was before this branch, and produces the same `CardEvent` shape it always did, plus one new optional property defaulted for it.
- **Every diagnostic is read-only.** None of `checkCountIntegrity`, `checkLedgerReplay`, `checkInvestigationHealth`, or `buildSupportPackage` writes to Dexie, mutates the `Investigation` object it's given, or calls a repository write function. They can be run against a closed, archived, or legacy-recovered investigation with zero risk of changing its data.
- **Legacy investigations are handled, not ignored.** The health summary's ambiguity check explicitly exercises `hasLegacyCardActivity`/`recoverLegacyLedger` — the exact functions that already handle pre-ledger investigations — so Deep Eye's diagnostics work correctly on the oldest data this app has, not just newly-created investigations.
- **Nothing in the live counting/entry path changed behavior.** `CardEntryPad`, `RoundControlsRow`, `QuickBetPanel`, `PlayerActionsRow`, `LiveScreen`'s layout, and every context handler they call are untouched by this branch except for the one-line `LiveMenu` addition (a new menu item and a new `BottomSheet` block, following the existing pattern exactly).

## 6. Baseline and final test results

| | Tests | Typecheck | Lint | Production build |
|---|---|---|---|---|
| Baseline (`master@541fd9d`, before any change) | 69/69 passing (9 files) | clean | clean | succeeds |
| Final (`deep-eye-1.20-prototype`, after this prototype) | 103/103 passing (14 files) | clean | clean | succeeds |

34 new tests, all added by this prototype, zero regressions in the 69 pre-existing ones.

## 7. Explicitly not built in this prototype

Per the required scope, none of the following exist in this branch: AI video recognition, a full voice engine (only the additive `source` metadata hook, unused by any real caller), player-advantage scoring, bet/count correlation, a strategy engine, enterprise cloud sync, licensing, subject profiles, or a replacement database architecture. `correlationScores` on `Investigation` is pre-existing (`master`, marked "Phase 7" in the type definition) and untouched here.

## 8. Files changed or created

See the companion implementation plan (§ "Exact files changed") for the complete, categorized file list.
