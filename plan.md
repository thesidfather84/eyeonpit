# EyeOnPit — Development Plan (Rev. 5 — Vercel Production Target)

**Product:** EyeOnPit
**Domain:** EyeOnPit.com
**Purpose:** Professional casino surveillance and blackjack investigation software. Primary use case: an operator on a phone, live at/near the pit, rapidly logging round-by-round blackjack activity across up to seven player seats — with zero dependency on casino Wi-Fi or cellular service, guided by a fast operational sequence rather than a manual.
**Hosting:** Vercel is the production hosting platform, assumed from every phase forward — see §13.

---

## 0. Guiding Principles

1. **Human judgment, not automated accusation.** EyeOnPit records observable facts and lets a human operator draw conclusions in their own words. Correlation scores are always labeled "reference only, not a conclusion." Executive summaries and memos start blank and are entirely operator-authored.
2. **Mobile-first, not mobile-adapted.** The phone is the primary device, used one-handed, live, at the table, for hours, with no signal. Desktop (Phase 6) and deeper analytics (Phase 7) build on the mobile core, not parallel to it.
3. **Local storage is a prototype choice, not the architecture.** Every record carries sync-ready fields (`localId`, `deviceId`, `syncStatus`, soft-delete) so a future secure backend can be added without a data-model rewrite.
4. **Guided, but never in the way.** New operators are taught the workflow inside the app. Experienced operators get out of the way entirely — every guidance mechanism is dismissible/skippable and never adds a step to the fast path.
5. **A round is one shared event, not N disconnected hands.** The dealer deals once per round to the whole table. EyeOnPit's data model mirrors that reality: one `DealerHand` per round, referenced by every seat in that round — never duplicated per seat.
6. **Production-quality at every phase, not prototype-then-harden.** Every phase must build, lint, and deploy cleanly on Vercel before it's considered done — see §13.

---

## 1. Tech Stack

Unchanged from Rev. 3: Next.js 14+ App Router, TypeScript strict, Tailwind (mobile-first, dark-only), Zustand, Dexie.js (IndexedDB), PWA/service worker, React Hook Form + Zod (setup wizard only), lucide-react, `date-fns`, Vitest + RTL (light).

---

## 2. Data Model (Round-Based)

The core structural change in this revision: a `Round` owns exactly one `DealerHand`, plus up to seven `SeatRoundRecord`s that reference it. Dealer cards are never copied into a seat record.

```ts
type Rank = "A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K";
type Suit = "♠"|"♥"|"♦"|"♣"|"unspecified";
interface CardCode { rank: Rank; suit: Suit; }

type SyncStatus = "local-only" | "pending" | "synced" | "conflict";
type InvestigationStatus = "draft" | "active" | "paused" | "closed";
type HandOutcome = "win" | "loss" | "push" | "blackjack" | "surrender" | null;
type WagerDirection = "up" | "down" | "same" | "first";
type PlayerAction = "hit" | "stand" | "double" | "split" | "surrender";
type DealerResult = "stand" | "blackjack" | "bust" | null;

interface Investigation {
  localId: string;
  displayId: string;               // "BJ-20260725-00001"
  status: InvestigationStatus;
  isDemo: boolean;

  casino: string;
  tableNumber: string;
  dealerName: string;
  investigationDate: string;
  operatorName: string;

  occupiedSeats: number[];         // subset of 1-7 actually in play; editable mid-investigation, see §9/§10
  trackedSeats: number[];          // subset of occupiedSeats being surveilled
  initialWagers: Record<number, number>;

  rounds: Round[];

  executiveSummary: string;
  surveillanceMemo: string;
  operatorNotes: NoteEntry[];

  correlationScores: Record<number, CorrelationScores>; // Phase 7

  pausedDurationMs: number;        // accumulated paused time, for an honest elapsed-time display
  pausedAt: string | null;         // set the instant status flips to "paused"; lets the timer reconstruct
                                    // correctly even if the app is reloaded mid-pause (Phase 2 addition)
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  syncStatus: SyncStatus;
  deletedAt: string | null;
}

interface Round {
  id: string;
  roundNumber: number;
  startTime: string;               // ISO datetime, auto-captured when the round begins
  videoTimestamp: string | null;   // optional
  dealerHand: DealerHand;          // ONE shared object, referenced by the whole table
  seats: Partial<Record<number, SeatRoundRecord>>; // keyed 1-7, only active/tracked seats populated
  runningCount: number | null;
  trueCount: number | null;
  operatorNote: string;            // optional round-level observation note
  createdAt: string;
  updatedAt: string;
}

interface DealerHand {
  upcard: CardCode | null;
  holeCard: CardCode | null;       // populated as soon as known, but...
  holeCardRevealed: boolean;       // ...stays hidden from every display/export until this flips true
  drawCards: CardCode[];           // additional cards, in the order added, post-reveal
  result: DealerResult;            // "stand" | "blackjack" | "bust" | null while in progress
}
// Dealer total is NEVER stored — always derived via computeHandTotal() from upcard + (holeCard if
// revealed) + drawCards. Storing a total invites it to drift out of sync with the cards; deriving it
// makes that class of bug impossible. See lib/utils/blackjackTotal.ts.

interface SeatRoundRecord {
  seatNumber: number;
  betAmount: number | null;
  wagerChange: {                   // auto-computed vs. this seat's previous round bet
    direction: WagerDirection;
    amount: number | null;
    overridden: boolean;           // true once an operator corrects it during Review — decision below
  };
  playerCards: CardCode[];
  actions: PlayerAction[];         // hit/stand/double/split/surrender, in order taken
  outcome: HandOutcome;            // "Result"
  deviationNote: string;           // neutral, factual — e.g. "stood 16 v. dealer 10"
  observationNote: string;
}

interface NoteEntry { id: string; timestamp: string; text: string; }
interface CorrelationScores {
  hiLo: number | null; ko: number | null; zen: number | null; omegaII: number | null;
  note: string;
}
```

`SeatRoundRecord` replaces the old per-hand `SeatHand` naming from Rev. 3 — the object is now explicitly scoped to "this seat's record within this round," which is what makes "no duplicated dealer data" structurally true rather than just a convention.

---

## 3. Investigation ID Generation

Unchanged from Rev. 2/3: `BJ-YYYYMMDD-NNNNN`, `localId` (uuid) is the real key, `displayId` is provisional pending a future sync backend.

---

## 4. Operator Onboarding & In-App Guidance System

Unchanged structure from Rev. 3 (walkthrough, progress indicator, field hints, tooltips, reopenable Help screen, practice investigation, completion confirmation, skippability). Two points finalized this revision:

- **Practice data:** the practice investigation is one fixed, clearly labeled (`isDemo: true`) built-in sample. It is filtered out of History's default view, out of every export function, and out of Report data by construction — `isDemo` is checked at the repository layer, not just in the UI, so it's structurally impossible for a demo investigation to leak into a real export.
- **Help copy:** Phase 2/5 ship with practical, plain-language placeholder copy (written now, not deferred), authored per-topic in `HelpTopicSection` components so each topic is a small, independently editable unit. No CMS or remote-editing system in this build — "keep it editable later" means the copy lives in clearly isolated components an editor can revise directly, not that end users edit it in-app.

---

## 5. The Operational Workflow

**Macro sequence** (unchanged): New Investigation → Table Setup → Seat Setup → Initial Bets → Live Hand Entry → Review → Report.

**5.1 Within-round entry sequence (new detail this revision)** — this is the recommended order of operations *inside* the Live Hand Entry loop, matching how a round actually unfolds at the table:

1. **Dealer upcard** — entered the moment it's dealt, before any seat is touched.
2. **Player cards and actions, by seat** — operator cycles the seat rail, entering each tracked seat's cards/actions/wager as the round plays out.
3. **Dealer hole card and draw cards, when revealed** — entered once the dealer actually turns it over and draws, not before.
4. **Seat results** — win/loss/push/blackjack/surrender per seat, once the round resolves.
5. **Save Round / Next Round** — commits the round (already autosaved throughout) and resets the dealer panel for the next round.

This is a *soft* sequence, not a locked wizard: every section stays reachable and editable throughout, because real play doesn't always go in a clean line (e.g., an operator may log a dealer bust before finishing every seat's notes). The screen visually emphasizes the current step without disabling the others — see §10.

---

## 6. Screens / Routes

Unchanged from Rev. 3: `/`, `/investigations/new` (wizard), `/investigations/[id]/live`, `/investigations/[id]/case` (Review/Report), `/investigations`, `/help`. Mid-investigation seat-count editing (§10) is reached from Live Entry, not a new route — it's a bottom sheet over the existing screen, consistent with "no extra navigation for routine adjustments."

---

## 7. Recommended Folder Structure

```
eyeonpit/
├── plan.md
├── package.json / tsconfig.json / tailwind.config.ts / next.config.js
├── public/{manifest.json, icons/}
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── help/page.tsx
│   │   ├── investigations/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/{live/page.tsx, case/page.tsx, loading.tsx}
│   │   └── not-found.tsx
│   │
│   ├── components/
│   │   ├── navigation/BottomNav.tsx
│   │   ├── onboarding/{WalkthroughOverlay,ProgressIndicator,FieldHint,HelpIconButton}.tsx
│   │   ├── help/{HelpCenterScreen,HelpTopicSection}.tsx
│   │   ├── dashboard/{ResumeInvestigationCard,NewInvestigationCta,PracticeInvestigationCta,RecentInvestigationsList}.tsx
│   │   ├── investigation-setup/
│   │   │   ├── {SetupWizardShell,TableSetupStep,SeatSetupStep,InitialBetsStep}.tsx
│   │   │   └── EditSeatsSheet.tsx        # NEW — mid-investigation seat count/tracked-seat edit, with confirmation
│   │   ├── live-entry/
│   │   │   ├── LiveEntryScreen.tsx       # composes the 5-step round sequence, §5.1
│   │   │   ├── DealerPanel.tsx           # NEW — permanent, sticky; upcard/hole/draw/total/BJ/bust/undo/clear
│   │   │   ├── SeatRail.tsx
│   │   │   ├── ActiveSeatPanel.tsx       # player cards, actions, wager, result, notes for the active seat
│   │   │   ├── CardTapPad.tsx
│   │   │   ├── ActionQuickTags.tsx       # NEW — hit/stand/double/split/surrender, one-tap
│   │   │   ├── BetQuickEntry.tsx
│   │   │   ├── WagerChangeBadge.tsx
│   │   │   ├── CountSteppers.tsx
│   │   │   ├── ResultQuickTags.tsx
│   │   │   ├── DeviationQuickTags.tsx
│   │   │   ├── RoundActionBar.tsx        # Save Round / Next Round
│   │   │   ├── PauseResumeControl.tsx
│   │   │   ├── TimestampSheet.tsx
│   │   │   └── NotesSheet.tsx
│   │   ├── case/
│   │   │   ├── CaseTabs.tsx
│   │   │   ├── review/
│   │   │   │   ├── SeatTimeline.tsx
│   │   │   │   ├── RoundList.tsx
│   │   │   │   └── WagerChangeEditor.tsx # NEW — corrects an auto-computed wager change during Review
│   │   │   └── report/{ExecutiveSummaryEditor,SurveillanceMemoEditor,OperatorNotesPanel,CorrelationScorePanel,ExportPanel,CompleteInvestigationDialog}.tsx
│   │   ├── history/InvestigationHistoryList.tsx
│   │   └── ui/{Button,TapChip,BottomSheet,Badge,Tooltip,StatusIndicator}.tsx
│   │
│   ├── lib/
│   │   ├── db/{schema.ts, client.ts, repositories/investigations.ts}
│   │   ├── sync/{types.ts, localOnlyAdapter.ts}
│   │   ├── onboarding/practiceInvestigationSeed.ts
│   │   ├── investigation-id.ts
│   │   ├── counting-systems/placeholders.ts
│   │   ├── export/{toJson.ts, toPdf.ts, toText.ts, toCsv.ts}
│   │   ├── validation/schemas.ts
│   │   └── utils/{formatters.ts, cards.ts, wagerChange.ts, blackjackTotal.ts}  # NEW: blackjackTotal.ts
│   │
│   ├── store/{useLiveEntryStore.ts, useSettingsStore.ts}
│   ├── types/investigation.ts
│   └── hooks/{useInvestigation.ts, useAutosaveIndicator.ts, useOnlineStatus.ts}
│
└── tests/lib/{investigation-id.test.ts, wagerChange.test.ts, blackjackTotal.test.ts}
```

---

## 8. UI/UX Direction — Dark, Low-Glare, Control-Room Interface

Unchanged from Rev. 3: near-black backgrounds, off-white (not pure white) text, minimal bright-white area, one muted non-alarming accent color, red reserved strictly for destructive actions/errors, large low-glare tap targets legible at low brightness. The dealer panel (§10) uses the same accent language as everything else — it is *not* styled as an alert panel despite being the table's shared, high-stakes data.

---

## 9. Guided Setup Wizard (steps 2-6)

Unchanged three-step wizard (Table Setup → Seat Setup → Initial Bets → Begin) from Rev. 3, plus one addition:

**Seat count is editable after setup (decision, was open question #5).** Players join and leave a table mid-shoe, so locking `occupiedSeats`/`trackedSeats` at setup would force operators to restart an investigation for a routine occurrence. `EditSeatsSheet` — reachable from a small "Edit Seats" control in the Live Entry top bar — reopens the same seat-toggle UI used in Seat Setup, and always shows a brief confirmation message ("Seat 6 will be added as tracked going forward — past rounds are unaffected") before committing, since this does change the shape of an in-progress investigation even though it's not destructive.

**Phase 2 refinement:** Seat Setup marks occupancy per seat individually (`occupiedSeats: number[]`) rather than a single "highest occupied" count — real tables aren't always contiguously filled (e.g. seats 2, 4, 7 occupied with 3/5/6 empty), and per-seat toggles are exactly as fast to tap. `trackedSeats` stays a subset of `occupiedSeats`; the UI disables tracking-toggles for any seat not currently marked occupied.

---

## 10. Dealer Workflow & Live Hand Entry Loop

### Dealer Panel — permanent and shared

`DealerPanel` is a **pinned/sticky section at the top of Live Entry**, visible at all times regardless of which seat is active on the `SeatRail` below it — switching seats never hides or resets it, because it belongs to the round, not to any seat. It supports:

- **Upcard entry** — large one-tap card buttons (same `CardTapPad` used everywhere else), entered immediately when dealt (§5.1 step 1).
- **Hole card, marked unrevealed until known** — shown as a face-down placeholder (e.g. a simple "hidden" card glyph) the moment the round starts; tapping it opens the same tap pad and flips `holeCardRevealed` to true only once the operator actually enters it (§5.1 step 3) — nothing about the hole card is ever inferred or guessed.
- **Additional draw cards, added in order** — appended to `drawCards` via the same tap pad, only reachable once the hole card is revealed (drawing before the hole is shown doesn't happen in real blackjack).
- **Automatic soft/hard total** — computed live by `lib/utils/blackjackTotal.ts` from whatever cards are currently visible (just the upcard pre-reveal; the full hand post-reveal). Never manually entered, never stored — see §2.
- **One-tap Dealer Blackjack** — sets `result = "blackjack"` directly; only enabled when exactly upcard + hole card are showing and they total 21, so it can't be tapped into an inconsistent state.
- **One-tap Dealer Bust** — sets `result = "bust"` the moment the total exceeds 21; also derivable automatically the instant a draw card pushes the total over 21, with the button available as an explicit, fast confirmation either way.
- **Undo last card** — pops the most recently added card (draw card if any exist, else the hole card, else the upcard), reversing exactly one tap.
- **Clear dealer cards** — resets the entire `DealerHand` for the *current* round only (with a lightweight "clear dealer cards?" inline confirmation, since it discards round-in-progress entry — the one other place besides Complete Investigation that gets a confirmation, per the "red/confirm reserved for real stakes" principle in §8).
- **Clearing between rounds is never automatic mid-round** — the panel only resets to a fresh, blank state as a direct consequence of the operator tapping **Next Round** (§5.1 step 5). Nothing clears on a timer or in the background.

### The five-step loop

Matches §5.1 exactly: Dealer upcard → player cards/actions by seat → dealer hole/draws → seat results → Save Round/Next Round. The screen doesn't hard-gate these steps (an operator can jump back to add a seat's card after logging the dealer bust, for instance) but visually leads with whichever step is next given what's already filled in, so a new operator has an obvious next tap and an experienced operator can freely work out of order.

### Per-seat entry

`ActiveSeatPanel` (unchanged position/role from Rev. 3, now paired with the always-visible `DealerPanel` above it) captures, per tracked seat: cards (`CardTapPad`), actions (`ActionQuickTags` — hit/stand/double/split/surrender, one tap each, appended in order to `actions`), wager (`BetQuickEntry`, with the auto-computed `WagerChangeBadge`), result (`ResultQuickTags`), and notes (`DeviationQuickTags` + free text).

### Pause (decision, was open question #1)

**Pause stops the active session timer only; all entered round data is preserved untouched.** `pausedDurationMs` on the investigation accumulates time spent paused so the elapsed-time display stays honest; nothing about `rounds` is altered by pausing. While paused, new round entry is blocked (dimmed `RoundActionBar`) but Review/Report remain fully readable, matching Rev. 3's behavior.

### Wager-change correction (decision, was open question #2)

Wager change stays **auto-computed** at entry time (§2), but `WagerChangeEditor` in Review lets an operator correct it after the fact (e.g., a bet was adjusted before cards were dealt in a way the auto-comparison didn't capture correctly) — setting `overridden: true` so Report/export can distinguish an operator-corrected value from a purely computed one.

---

## 11. Build Phases

**Phase 1 — Mobile application shell and offline storage**
Mobile-first scaffold, dark theme tokens (§8), PWA/offline foundation, Dexie schema + repositories built around the round-based model in §2 (sync-ready fields, `isDemo` filtering at the repository layer), `useSettingsStore`, `lib/sync/localOnlyAdapter`.

**Phase 2 — Seven-seat blackjack table and seat selection** ✅ built
4-step setup wizard (Table Setup, Seat Setup, Initial Bets, Begin Recording) with progress dots and Back/Next/Cancel; per-seat occupied/tracked toggles (`occupiedSeats`, see §2 refinement); `EditSeatsSheet` for mid-investigation changes with confirmation; investigation ID generation on finish, routing straight to Live Entry; field hints on first-touch fields (`FieldHint`, dismissible, gated by `showGuidedTips`); a clearly-labeled Practice Investigation entry point (find-or-create, `isDemo: true`, excluded from History/exports at the repository layer per Decision 3). Also shipped the Live Entry **shell**: permanent `DealerPanel` and seven-seat `SeatRail` (placeholder card/wager/result/notes controls only), plus fully functional round number, elapsed session timer, and Pause/Resume (using the new `pausedAt` field for reload-safe timer reconstruction) and Save Round/Next Round wired to the real round-based model. The first-use walkthrough overlay and full Help Center content are still outstanding — carried forward into Phase 3/5.

**Phase 3 — Rapid live hand and wager entry**
Fill in the Live Entry shell from Phase 2 with real interaction: `CardTapPad` (upcard/hole/draws/undo/clear/blackjack/bust with live soft/hard total), `ActiveSeatPanel` wired to real cards/actions (`ActionQuickTags`), bet quick-entry (chips/repeat/+-/keypad) with auto wager-change, result tags, deviation/observation notes, count fields, tooltips on count/score terms. First-use walkthrough overlay ships here too.

**Phase 4 — Investigation history and editing**
History list/search (demo investigations excluded at the repository layer), opening/editing past investigations and past rounds.

**Phase 5 — Mobile reporting and JSON export**
Review (`SeatTimeline`, `RoundList`, `WagerChangeEditor`) and Report (summary/memo/notes, correlation placeholder panel, JSON export, `CompleteInvestigationDialog`). Help Center content extended to cover the full workflow including dealer entry and mid-investigation seat edits.

**Phase 6 — Desktop/web review portal**
`md:`/`lg:` layouts on the same routes/data, same dark palette, sync backend groundwork via `SyncAdapter`.

**Phase 7 — Count-model comparisons and expanded exports**
Real Hi-Lo/KO/Zen/Omega II correlation calculations, PDF/TXT/CSV export completion, cross-seat/cross-investigation comparisons.

---

## 12. Decisions Log (previously "Open Questions" — all five resolved this revision)

1. **Pause semantics:** pause stops the session timer only; all round data is preserved. (§10)
2. **Wager-change override:** computed automatically at entry, correctable later in Review via `WagerChangeEditor`, with an `overridden` flag retained for traceability. (§2, §10)
3. **Practice data:** one fixed, clearly labeled (`isDemo`) sample investigation, excluded from real exports/reports at the repository layer, not just the UI. (§4)
4. **Help copy:** practical placeholder copy shipped now, structured per-topic so it's easy for a human editor to revise later — not an in-app editing system. (§4)
5. **Seat count after setup:** editable mid-investigation via `EditSeatsSheet`, always shown with a confirmation message, since players joining/leaving is routine. (§9)

No open items remain blocking Phase 1.

---

## 13. Deployment & Production Readiness (Vercel)

Vercel is the assumed production hosting platform from Phase 1 forward, not a later concern bolted on at ship time. This section is the standing checklist every phase gets held to.

### 13.1 Architecture constraints

- **No traditional Node server.** Nothing in this app should assume a long-lived process, an attached filesystem, or in-memory state that survives between requests. Vercel's Next.js runtime is serverless/edge by nature; code that needs `fs` writes, background timers outside the browser, or sticky server state doesn't belong here. EyeOnPit's architecture already satisfies this by construction — there is no backend in Phases 1-5, and all persistence is client-side (Dexie/IndexedDB), never server filesystem.
- **App Router features Vercel fully supports** — Route Handlers, `app/manifest.ts`, `generateMetadata`/`viewport`, `instrumentation-client.ts`, Server/Client Component split — used per their intended purpose, not worked around.
- **Static optimization by default.** Pages/segments that don't need interactivity stay Server Components and get prerendered (`○` in the build output); `"use client"` is scoped to the components that actually need browser APIs (Dexie, hooks, event handlers) rather than applied to whole route files out of convenience. Every build's route table (`npm run build` output) is a quick visual check of this — see 13.3.
- **Secrets via Vercel Environment Variables**, never hardcoded, whenever a future phase introduces any (sync backend credentials, API keys). Nothing in the app requires secrets yet; this is a standing rule for when Phase 6+ needs them, not a retrofit.
- **No local filesystem persistence.** Already true — Dexie/IndexedDB is browser storage, not server disk, which is also exactly what makes it compatible with Vercel's stateless request model in the first place.
- **Responsive across iPhone, Android, tablet, and desktop breakpoints** — mobile-first base styles (§0.2) plus `md:`/`lg:` additions from Phase 6 onward; verified visually, not just assumed from the CSS.

### 13.2 PWA on Vercel

Vercel serves static assets (including `public/sw.js` and the files `app/manifest.ts` generates) with no special configuration required — the offline shell from §5 works unmodified on Vercel. The one thing that needs explicit config is cache headers on the service worker file itself (`no-cache, no-store, must-revalidate`, set in `next.config.ts`) so operators always get a fresh worker on deploy rather than a stale cached one silently serving an old app shell.

### 13.3 Definition of done, per phase

Before any phase is considered complete:

1. `npm run build` succeeds with no errors.
2. `npm run lint` passes with no errors.
3. The build output's route table is reviewed — routes expected to be static (`○`) are static; only routes that genuinely need per-request rendering are dynamic (`ƒ`).
4. No hydration warnings in the browser console on any screen touched by the phase (dev server, hard refresh) — values that can legitimately differ between server and first client paint (e.g. `navigator.onLine`) are read via `useSyncExternalStore` with a server snapshot, not a raw `useEffect`-then-`setState` pattern that risks a mismatch.
5. A quick responsive check at phone, tablet, and desktop widths.
6. Local `git commit` + `git push` to `https://github.com/thesidfather84/eyeonpit.git`, leaving the repo in a state that would deploy cleanly if connected to Vercel.

### 13.4 Dependency policy

New dependencies are chosen for active maintenance and compatibility with current Next.js/React/TypeScript/Vercel — and avoided altogether when the same result is achievable with what's already in the stack or the platform itself (example: Phase 2's PWA icons were generated with a small one-off script using Node's built-in `zlib`, rather than adding a native image-processing dependency like `sharp` just to produce two static PNGs once).

---

**Next step:** Phase 3 — fill in the Live Entry shell (§11) with real card/wager/result/note interaction.
