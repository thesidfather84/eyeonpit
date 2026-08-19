# EyeOnPit — Product Specification

**Status: Canonical.** This document is the authoritative product direction for EyeOnPit. It is not a brainstorm and not a wishlist — it describes what EyeOnPit *is*, what it must never compromise on, and what is actually built today versus planned.

> **Before major EyeOnPit development, review this specification.** Do not introduce architecture or UX that conflicts with an established requirement without explicitly documenting the conflict (what requirement it conflicts with, and why the tradeoff was made) in the PR/commit description and, if the conflict is structural, as an amendment to this document.

Every capability below is tagged **IMPLEMENTED**, **PARTIAL**, **PLANNED**, or **FUTURE** in the [Implementation Status Matrix](#implementation-status-matrix) at the end, with pointers to real source files. Do not trust a capability description in the prose sections above the matrix as evidence that it's built — check the matrix and the cited files.

---

## 1. Product Mission

EyeOnPit is the successor to Bloodhound, the legacy surveillance tool it replaces.

**The operator watches the game. EyeOnPit remembers everything else.**

A surveillance operator's attention belongs on the table, the players, and the dealer — not on a clipboard, a spreadsheet, or a fight with a UI. EyeOnPit's job is to capture a complete, accurate, timestamped, mathematically sound record of a blackjack investigation — cards, counts, wagers, player behavior, and operator observations — with as little of the operator's attention diverted from the game as possible. Every architectural decision is judged against this: does it let the operator watch the game more, or less?

## 2. Mobile First

iOS and Android (phone form factor, one-handed/thumb operation, worn on a lanyard or held) are the **primary** targets. Desktop/tablet use is secondary and must never dictate architecture, layout, or interaction design. If a decision would make the phone experience worse to make the desktop experience better, the phone wins.

Concretely: touch targets sized for fast tapping under real casino-floor conditions (low light, glancing attention, one hand free), no interactions that require a mouse-only affordance (hover-to-reveal, right-click), and no layout that assumes a wide viewport is available.

## 3. Offline First

EyeOnPit must work with zero network connectivity, because casino floors and surveillance rooms are not guaranteed to have reliable connectivity, and an investigation cannot pause because a Wi-Fi access point dropped.

The following **must** work fully offline, with no degraded behavior:

- Create and resume an investigation
- Card entry (manual)
- Counting (all systems) and true-count calculation
- The CardEvent ledger (recording, undo, redo)
- Wager entry and changes
- Player actions (splits, doubles, surrender, insurance, seat occupancy)
- Operator notes
- Undo / redo
- Round and shoe management (new round, new shoe, shuffle)
- Review / history of past and in-progress investigations
- Local persistence (nothing is lost if the device loses connectivity or the app is closed)

**Voice may degrade when offline** (cloud speech-recognition services generally require network access) — but voice degrading must **never** disable or block the investigation. When speech recognition is unavailable, the operator must be able to keep working through manual controls with zero loss of functionality, and the app must say so clearly rather than fail silently or loop.

## 4. Dual Operational Roles

EyeOnPit is **one application with one authoritative investigation engine/ledger**, presented through **two role-specific UI shells**:

1. **Surveillance** — the full investigation workspace: table/player detail, notes, evidence review, analysis, reports/history/export. Intended for surveillance-room operation, where a larger screen presence and deeper detail are appropriate.
2. **Floor** — designed for pit bosses/floor supervisors doing discreet in-person assessment: mobile-first, voice-first, minimal screen interaction, headset/AirPods-friendly.

Floor is not a separate counting architecture, a separate backend, or a parallel data model. Every Floor Mode screen reads and writes through the exact same `InvestigationContext`, the exact same CardEvent ledger, the exact same count engine, and the exact same card/wager/action mutations Surveillance uses. An investigation started in one shell is the identical investigation viewed in the other — there is no "Floor investigation" distinct from a "Surveillance investigation," only one investigation viewed through a different UI.

### Floor Mode Principle

The phone should be able to remain in the operator's pocket for much of the investigation. Normal target workflow:

> Open EyeOnPit → enter Floor Mode → mic ON → speak game observations/commands → receive discreet confirmation/status through headset or haptic feedback → minimal/no need to look at phone

The live Floor UI is intentionally simple:

- compact status/header
- current seat/player/dealer context
- essential card/action controls
- large microphone control
- Undo / Done / Next
- secondary controls behind deliberate access

A calculator-like visual grammar is acceptable because it is familiar and low-attention, but the app must not falsely impersonate an unrelated calculator application — Settings/About must always identify EyeOnPit normally, regardless of how minimal the live Floor screen itself looks.

**Manual controls remain the mandatory fallback** in Floor Mode exactly as in Surveillance — Floor Mode never becomes voice-only. When voice is unavailable, inaccurate, too noisy, or inappropriate for the moment, the operator drops to the same manual keypad/round controls Surveillance uses, with zero loss of investigation function (see §3, Offline First, which applies identically to both shells).

Reaching Floor Mode from Surveillance, and returning to Surveillance from Floor, must always be one deliberate tap away — never a dead end. Floor is also a first-class launch action in its own right, directly on the app's landing screen (§8) — an operator never has to enter Surveillance first and hunt for it.

## 5. Voice Control Coverage

Long-term, nearly every live-field operation should have a safe voice equivalent, including:

- seat/spot/dealer selection
- cards
- hit/stand/double/split/surrender/insurance
- wagers
- next/done
- undo
- count/status request (read-only — see §6)
- notes/observations
- relevant navigation

Coverage today is partial (see the status matrix): seat/spot/dealer selection, cards, next/done/undo, notes, and the read-only count/status request are implemented. Player-decision actions (hit/stand/double/split/surrender/insurance) and wager mutation are not yet voice-controlled — see §14 for the wager design already worked out, and the Bloodhound-benchmark player-action set in §17 for what player-decision voice coverage will eventually need to reach.

Every voice command, present or future, is bound by the same count-integrity precedence as card entry (§9, §12): deterministic parsing only, no LLM/network dependency for anything that can mutate investigation state, and refuse rather than guess whenever input is ambiguous.

## 6. Hands-Free Audio Feedback

Floor Mode supports concise spoken feedback through a headset, for the read-only "Count" and "Status" voice commands (see §12):

- **"Count"** → e.g. "Hi-Lo plus three. True count plus one point six. K O plus seven."
- **"Status"** → concise current target/round/count state, e.g. "Seat three active. Round four. Hi-Lo plus three."

Normal operation must not be excessively talkative — spoken feedback is limited to these explicit, operator-requested read-only queries, never ambient narration of every action. Short audio confirmations or haptics are preferred over longer speech where either would do.

**Audio output is configurable** — an operator can turn spoken responses off entirely from Settings, in which case "Count"/"Status" still work and still display their answer as text, just without speaking it.

Text-to-speech support and voice quality vary meaningfully across iOS Safari, Android Chrome, and installed-PWA contexts — this is implemented as a clean, isolated interface/abstraction with runtime feature detection (see `lib/voice/speechOutput.ts`), not an assumption of universal support. Where synthesis is unavailable, the same information is still shown as text; nothing about the underlying command depends on audio actually playing.

## 7. Noise / Mobile Reality

Casino floors are noisy. EyeOnPit uses available iOS/Android/headset voice-processing capabilities where the platform provides them, but never assumes noise cancellation is perfect.

**Noise suppression is not the safety mechanism.** The safety mechanism is, and remains, deterministic parsing and refusal to mutate the ledger when speech is ambiguous (see §9, §12) — the same rule whether the environment is silent or a full casino floor. Core investigation operation must remain fully functional even when voice fails completely, on the noisiest floor or the quietest back office alike.

## 8. Launch Experience

Exactly four entry points, presented at app launch, all directly visible on the landing screen — none requires entering Surveillance first or hunting through a menu:

- **Quick** — fastest path into a live Surveillance investigation with sensible defaults. Remains the visually dominant default action.
- **Floor** — one tap into the hands-free Floor workflow (§4), equally discoverable as Quick and clearly identified as the pit/floor path, styled distinctly so the two are never confused. Uses the exact same saved/default game configuration as Quick (never a separate setup step) and creates its investigation through the exact same `createInvestigation` call — there is no separate Floor launch data path. Routes directly to `/investigations/[id]/floor`, rather than opening in place the way Quick/Advanced/Practice do, since Floor Mode is a distinct screen (see §4) rather than a variant of the in-place Surveillance console.
- **Advanced** — full setup sheet (casino, table, rules, seats) before starting.
- **Practice** — a sandbox investigation for training/rehearsal that doesn't pollute real investigation history.

No other top-level launch paths. Advanced and Practice remain available without added clutter from Floor's presence. See [`EmptyConsole.tsx`](../src/components/live/EmptyConsole.tsx) and [`QuickSetupSheet.tsx`](../src/components/live/QuickSetupSheet.tsx).

Floor launched from the landing screen and Floor reached mid-investigation via Surveillance's "Floor Mode" entry (§4) are the same feature reached two ways — switching between Floor and Surveillance inside an already-active investigation remains available either way.

**Practice state integrity.** Starting a new Practice exercise must never silently present stale cards/counts from a previous exercise as if they belong to the new one. A previous Practice investigation may remain reachable for review (the underlying record persists), but every tap of "Practice" must provide fresh current hand state, a fresh shoe/count state, and no stale dealer/player cards. See [`findOrCreatePracticeInvestigation`](../src/lib/onboarding/practiceInvestigationSeed.ts) and `resetPracticeInvestigationLiveState` in [`lib/db/repositories/investigations.ts`](../src/lib/db/repositories/investigations.ts) — this destructively clears the disposable practice CardEvent ledger, and is guarded to refuse any investigation that is not `isDemo` (see §9's Practice-vs-Production distinction — this is not the same operation a production reset would ever use).

## 9. Count Integrity

This is the single most important non-negotiable in the product. The CardEvent ledger is the **sole source of truth** for everything derived from cards seen.

- Every card is counted **exactly once**. The dealer's cards are counted exactly once.
- Manual card entry and voice card entry **share the same ledger path** — there is no separate "voice counting" or "manual counting" system to keep in sync. One event stream, multiple entry surfaces.
- Undo/redo operates on that same event stream (`status: "active" | "undone" | "void"`), and is **context-aware**: undoing a specific target's last card must not corrupt another target's data just because it was entered later in wall-clock time. See `mostRecentActiveEventForTarget` in [`lib/counting-engine/ledger.ts`](../src/lib/counting-engine/ledger.ts).
- Clearing a display value (e.g. resetting a seat's shown hand) never erases the underlying counted cards — the ledger event stays authoritative even if the UI stops showing it.
- Removing a seat from the table does not alter cards already observed and counted from that seat.
- There is no parallel/shadow counting architecture anywhere in the app. Hi-Lo, KO, Zen, Omega II, true count, and aces-seen are all *derived views* computed from the same CardEvent stream — never independently tracked counters.
- Voice must **never guess** on ambiguous card input. If a spoken command could plausibly mean more than one distinct card value, EyeOnPit rejects it and asks the operator to repeat or re-enter manually, rather than silently picking one. One accepted spoken card = exactly one CardEvent — never zero (silently dropped), never two (duplicated from interim/final speech-recognition overlap or replayed committed tokens).

### Practice reset vs. production evidence preservation

EyeOnPit is **evidence-first and auditable** for real investigations. This has a direct, deliberate consequence for what "reset" is allowed to mean, and it is not the same thing in both of EyeOnPit's shells:

**Practice is disposable.** A Practice (`isDemo: true`) investigation has no evidentiary value — nothing about it will ever be reported, reviewed by a manager, or relied on as a record of a real game. Starting a fresh Practice exercise is allowed, and required (§8), to destructively clear and reseed its CardEvent ledger along with its rounds/seats. `resetPracticeInvestigationLiveState` performs exactly this, and refuses (throws) if pointed at anything that isn't `isDemo` — the guard lives in the function itself, not just at the call site, precisely so this destructive path can never reach a real investigation by accident.

**Production CardEvents are authoritative evidence and must never be silently deleted by a normal operator action.** There is no "Reset Current Investigation" for a live investigation, and there must never be a low-friction one: corrections and undo preserve history (they flip `status` to `"undone"`/`"void"`, they never delete a row — see the ledger status model above), and reports/analysis must remain reproducible from retained source events. Instead, EyeOnPit offers two audit-safe, non-destructive ways to reset what a production investigation's *count* or *table state* looks like, both using existing domain semantics rather than any new deletion path:

- **New shoe boundary** — `advanceRound(investigationId, { newShoe: true })` ("Start New Shoe" in the Live menu). Increments the shoe number and starts a fresh round; every CardEvent from the prior shoe stays in the ledger exactly as recorded, simply excluded from the new shoe's running count by `shoeNumber` — nothing is deleted, and the prior shoe remains fully reconstructible.
- **Start Fresh Investigation** (Settings) — closes/archives the current investigation (`completeInvestigation`, kept fully intact in History) and opens a brand-new blank one (`createInvestigation`). The closed investigation's CardEvents are completely untouched; nothing is migrated or shared between the two records.

If a genuinely destructive production reset is ever proposed in the future, it must not be added casually: it requires deliberate high-friction confirmation, must clearly state that evidence will be permanently destroyed, and must produce an audit record before deletion. No such path exists today, by design.

**Do not change CardEvent or counting mathematics without an explicit, separate, deliberate request.** This is the one area of the app where "improve it while I'm in there" is not welcome.

## 10. Pre-Release Validation

Count Integrity (§9) is a claim about the whole system's behavior, not just its code — and a claim that scale is exactly where a subtle ledger/counting bug (an off-by-one in sequence numbering, a status-transition edge case, a shoe-boundary leak) is most likely to surface, since real production usage will eventually exercise far more hands than any hand-written unit test does. **Large-scale deterministic validation of the counting/ledger path is a required part of preparing any release that touches `lib/counting-engine/*`, `lib/db/repositories/cardEvents.ts`, or `lib/db/repositories/investigations.ts`'s round/shoe-advance functions.**

The harness lives at `src/lib/counting-engine/validation/` (technical detail in `docs/VALIDATION.md`) and works by driving the **real** production path — `createInvestigation`, `occupySeat`, `addCardToRound`, `undoTargetCard`/`redoTargetCard`, `advanceRound`, `markSeatEmpty`, `mutateRound`, `calculateCountSnapshot` — through a large number of deterministically-seeded simulated shoes/hands, and comparing every result against a small, independently hand-written reference model (never production's own calculation called twice). Three levels:

- **SMOKE** — small, fast, runs automatically with every `npm test`.
- **STANDARD** — thousands of hands, run deliberately via `npm run validate:counting` before a release.
- **STRESS** — tens of thousands of hands / hundreds of thousands of CardEvents or more, run manually via `npm run validate:counting:stress`, not part of routine workflow.

**Wording discipline:** a passing run is evidence — *"passed N simulated hands/events with zero detected mismatches against the independent reference model"* — never a claim of mathematical proof or formal verification. See `docs/VALIDATION.md`'s "What this proves" / "What this does not prove" sections before writing about this capability anywhere product-facing.

If the harness ever finds a real mismatch, the correct response is to stop and report the exact reproducible failure (seed, shoe, round, op, expected vs. actual — see `docs/VALIDATION.md`'s replay mechanism) before changing any counting logic — the harness exists to expose a bug, never to be adjusted until it agrees with one.

## 11. Live UI

The live investigation screen must be stable, fast, and non-jumpy — no layout shift while cards are being entered or the count is updating.

A single unified header shows, at a glance:

- Investigation identity (casino, table, shoe/round)
- **Hi-Lo running count and true count** — the primary, most visually prominent numbers, since Hi-Lo is the count system operators reason in day-to-day
- KO, Zen, and Omega II counts, and Aces Seen, and decks remaining — secondary, still visible, but not competing visually with Hi-Lo
- Core controls (new round, new shoe, undo)

Secondary configuration (rule changes, seat setup details, table edits) must require a deliberate interaction (e.g. entering an explicit Edit Mode, opening a sheet) — it must not be reachable by an accidental tap during normal fast-paced play. See [`LiveHeader.tsx`](../src/components/live/LiveHeader.tsx), [`CountSummaryPanel.tsx`](../src/components/live/CountSummaryPanel.tsx), [`TableMap.tsx`](../src/components/live/TableMap.tsx) (Edit Mode).

Floor Mode (§4) reuses this same count engine and the same header building blocks in a deliberately smaller arrangement — see [`FloorScreen.tsx`](../src/components/live/FloorScreen.tsx) — rather than a second, independently designed header.

## 12. Voice — End Goal

**One tap turns voice ON. One tap turns it OFF.** No modes to remember, no push-to-talk button to hold.

The end-goal is natural phrasing, not a rigid command grammar the operator has to memorize:

- "Dealer, king, ace"
- "Spot one, ace four"
- "Player in spot two raised his bet when the count was high"

To get there safely, EyeOnPit must be able to distinguish three categories of speech while listening continuously:

- **A. Structured facts** — deterministic, parseable commands that map to a specific action (a card for a specific target, a seat/dealer reference, a control command). These become CardEvents or explicit actions.
- **B. Casino-relevant observations** — meaningful surveillance content that isn't a structured command (player behavior, wager commentary, a physical description) — these become notes/observations, not silently discarded and not misinterpreted as card commands.
- **C. Irrelevant chatter** — personal, off-topic speech with no surveillance value (e.g. "I'll take a cheese pizza with extra sauce"). This must **never** become a permanent note or otherwise pollute the investigation record.

Count-integrity precedence (restated from §9 because it governs voice specifically): never guess on ambiguous card input; never duplicate a CardEvent from interim/final speech-recognition overlap; never replay an already-committed speech token; one accepted spoken card is exactly one CardEvent; when structured input is uncertain, reject it and let the operator repeat or fall back to manual entry rather than guessing.

Known, deterministic recognition artifacts may be safely normalized in a target context — e.g. "C1" reliably meaning "Seat 1" from certain recognizers — but only where it is unambiguous and only within an active target context; normalization must never let arbitrary noise become a card or a target. See `seatFromCToken` in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts).

**A transcript containing one recognizable card word is not automatically a structured command.** Under continuous listening, ordinary conversation will routinely contain a card word ("player bet ace," "I saw an ace earlier," "that guy looks like a king") — none of that may create a CardEvent merely because the parser could find one card token in it and discarded everything else as noise. The deterministic boundary (no LLM, no network dependency, fully offline-capable) is: a target/card fast path handles exact structured phrases; a bounded noisy-token fallback tolerates at most one truly unrecognized token (a misheard name, a garbled near-miss) alongside a target and/or a single unambiguous card; anything noisier than that — the ordinary shape of a real sentence — is rejected outright, same as any other unrecognized phrase. See `MAX_NOISE_TOKENS` in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts). This is the safety boundary called for in this section's A/B/C classification; it draws the line for category A (structured commands) precisely — it does not yet implement categories B or C (see the status matrix).

"Count" and "status" (§6) are the first read-only, non-mutating voice commands — they prove the same deterministic-parsing/exact-phrase machinery can safely answer a question, not just accept a structured fact, without ever touching the ledger.

## 13. Voice Notes / Natural Observations

**Today (safe fallback):** an explicit Start Note / End Note state machine. The operator says a start phrase, speaks freely, and says an end phrase (or a cancel phrase to discard). The captured text is stored verbatim through the existing operator-notes mechanism — timestamped, tagged with investigation context, and stored as the **original observation/source text**.

**Long-term goal:** natural conversational capture, without requiring an explicit start/end ritual — the system itself classifies ongoing speech into the A/B/C categories from §12 in real time.

Whenever a future "cleaned up" or paraphrased version of a note is introduced (for report readability), the **original observation must be preserved and must remain distinguishable from the paraphrase** — never overwrite or silently replace the source text. This is the same principle as §9's ledger integrity, applied to the observation record: the raw capture is the record of truth; anything derived from it is clearly labeled as derived.

## 14. Player / Game Tracking

EyeOnPit tracks, per investigation: seats and the players occupying them, the dealer, cards (per hand, per seat, per dealer), splits, doubles, surrender, insurance, wager amount and wager changes over time, bet spread, player decisions, table rule configuration, shoe/deck state, the count at meaningful moments (e.g. at each wager decision), timestamps throughout, and free-text operator observations.

**Voice wager input (planned, not yet implemented).** Wager entry today is manual-only, through the existing authoritative action (`updateSeatAtTarget` + `computeWagerChange`, dispatched via `mutate` — see [`QuickBetPanel.tsx`](../src/components/live/QuickBetPanel.tsx)). Real field captures show wager language arriving as two separate recognition finals in sequence ("Player bet." then "$30." as distinct utterances) — that is a stateful, cross-utterance streaming problem with the same duplication/replay risks as multi-card streaming (see §12's ambiguity/replay rules) and is deliberately left unimplemented until a provably safe commit strategy exists, exactly as multi-card phrases are. A single-utterance deterministic grammar is designed and ready to implement once prioritized, reusing that same authoritative action with no new mutation logic: `"bet 30"` / `"wager 30"` (applies to whatever seat is currently the active target — rejected if the active target is the dealer, since the dealer has no wager), and `"seat 5 bet 30"` / `"seat 5 wager 30"` (explicit target, same as a spoken card target). The amount is parsed as a plain integer only — never through the card-rank lexicon — so it can never collide with a card command.

## 15. Advantage-Play Analysis ("Deep Eye")

Deep Eye is EyeOnPit's advantage-play analysis capability — a set of *indicators*, not a verdict. It should surface:

- Correlation between a player's wager size and the true count at the moment the wager was placed
- Bet spread (min/max ratio, and how it changes over the session)
- Timing of wager changes relative to count swings
- Playing-strategy deviations, including deviations that match known count-index plays
- Insurance decisions relative to the count
- Doubles/splits/surrenders relative to both the count and basic strategy
- Player decision accuracy against basic strategy and count-based deviation strategy
- An estimated player edge — **only** where the sample size and data actually support a mathematically defensible estimate
- An explicit sample-size / evidence-quality indicator alongside any estimate
- Likelihood/confidence measures that have a **defined mathematical meaning** (e.g. a correlation coefficient, a sample size, a p-value) — EyeOnPit must never invent an AI-style "87% confidence" figure that doesn't correspond to an actual computation.

Every Deep Eye assessment must include a clear, human-readable **WHY** — the evidence and reasoning behind the number, not just the number. Deep Eye informs the surveillance manager; it does not accuse. Human judgment is always final.

## 16. Final Investigation Report

At "End Investigation," EyeOnPit generates a detailed, professional player-profile / investigation report — suitable for PDF export, printing, a surveillance binder, a case file, or management review by someone who was **not present** during the investigation.

The report must clearly separate **OBSERVED FACTS** from **DERIVED ANALYSIS** (i.e., ledger-backed facts vs. Deep Eye output), and should include:

- Investigation/session ID, date/time, property, table
- Game and rule configuration
- Player profile: alias/name/player-card fields, physical description fields, known-associates/reference fields
- Shoes and hands observed
- Wager history and bet spread
- Count history and its correlation with wager behavior
- Player decisions and any strategy deviations
- Insurance / double / split / surrender behavior
- Estimated advantage, only where mathematically defensible, with evidence quality and sample size stated alongside it
- A timeline of the investigation
- Operator observations (verbatim, per §13)
- The Deep Eye assessment, with its WHY explanation
- Disposition / management notes
- Blank fields that can be completed later (e.g., by a manager after the fact)

A surveillance manager who was not in the room during the investigation should be able to read this report and understand exactly what happened and why it matters.

## 17. Bloodhound Benchmark

Legacy Bloodhound is a **benchmark, not a UI template.** EyeOnPit is not obligated to look or feel like Bloodhound — it is obligated to match or exceed what Bloodhound could actually do: game reconstruction, counting, wager correlation, player decision analysis, advantage estimation, and investigation documentation.

EyeOnPit's path to exceeding that benchmark is mobile-first capture, offline-first reliability, natural voice input, a deterministic single-source-of-truth event ledger, faster in-the-moment capture, a modern and non-jumpy UX, explainable (not black-box) analysis, better and more portable reporting, and a fully auditable event history.

## 18. Internal Credit

- **Sidney Impastato — Creator / Developer**
- **Forge — Architect**

This credit is discreet — present somewhere in the codebase/app (e.g. the Settings → About section) but must not clutter or intrude on the normal operator-facing UI. "Forge" is the project's internal architect designation and is explicitly **not** presented as a human employee.

---

## Implementation Status Matrix

| Capability | Status | Notes / Source |
|---|---|---|
| Launch: Quick / Floor / Advanced / Practice | **IMPLEMENTED** | [`EmptyConsole.tsx`](../src/components/live/EmptyConsole.tsx) (Floor: one-tap, same `createInvestigation` input as Quick via `buildQuickInvestigationInput`, routes to `/investigations/[id]/floor`), [`QuickSetupSheet.tsx`](../src/components/live/QuickSetupSheet.tsx), [`lib/onboarding/practiceInvestigationSeed.ts`](../src/lib/onboarding/practiceInvestigationSeed.ts) |
| Practice state integrity (no stale cards/count on a fresh Practice tap) | **IMPLEMENTED** | Root cause was the shared reset helper clearing the round/seat display state but never the CardEvent ledger table for that investigation, so a reused practice record's count survived the "reset" invisibly; fixed via `resetPracticeInvestigationLiveState` in [`lib/db/repositories/investigations.ts`](../src/lib/db/repositories/investigations.ts) (deletes the investigation's CardEvents in the same transaction) and [`practiceInvestigationSeed.ts`](../src/lib/onboarding/practiceInvestigationSeed.ts) (calls it before re-seeding) |
| Practice vs. production reset separation (production CardEvents can never be silently deleted by a normal operator action) | **IMPLEMENTED** | `resetPracticeInvestigationLiveState` throws if the target investigation is not `isDemo` — enforced in the function itself, in [`lib/db/repositories/investigations.ts`](../src/lib/db/repositories/investigations.ts). Settings' "Current Investigation" section renders the destructive "Reset Practice Data" button only when `isDemo`; a production investigation only ever sees the non-destructive "Start Fresh Investigation" path, in [`SettingsScreen.tsx`](../src/components/settings/SettingsScreen.tsx). Audit-safe production alternatives (`advanceRound({ newShoe: true })`, close + create new) never delete a CardEvent — see §9 |
| Large-scale deterministic counting/ledger validation harness (SMOKE/STANDARD/STRESS) | **IMPLEMENTED** | [`lib/counting-engine/validation/`](../src/lib/counting-engine/validation/) — see [`docs/VALIDATION.md`](VALIDATION.md). SMOKE runs with `npm test`; `npm run validate:counting` / `:stress` run STANDARD/STRESS. Drives the real production path against an independent, hand-written oracle — see §10 |
| CardEvent ledger (single source of truth) | **IMPLEMENTED** | [`lib/counting-engine/ledger.ts`](../src/lib/counting-engine/ledger.ts), [`lib/db/repositories/cardEvents.ts`](../src/lib/db/repositories/cardEvents.ts) |
| Counting systems: Hi-Lo, KO, Zen, Omega II, true count, aces seen | **IMPLEMENTED** | `lib/counting-engine/*` — see [`docs/counting-systems.md`](counting-systems.md) for the authoritative math reference |
| Context-aware undo/redo (per-target, not whole-round-snapshot) | **IMPLEMENTED** | `mostRecentActiveEventForTarget` in [`lib/counting-engine/ledger.ts`](../src/lib/counting-engine/ledger.ts), `undoTargetCard`/`redoTargetCard` in [`lib/db/repositories/cardEvents.ts`](../src/lib/db/repositories/cardEvents.ts), [`contexts/InvestigationContext.tsx`](../src/contexts/InvestigationContext.tsx) |
| Offline local persistence (IndexedDB via Dexie) | **IMPLEMENTED** | `lib/db/*` |
| PWA / service worker | **IMPLEMENTED** | Confirmed live via Settings → About (Service Worker / Active Cache / Update Waiting rows) in [`SettingsScreen.tsx`](../src/components/settings/SettingsScreen.tsx) |
| Offline card entry, wagers, player actions, notes, undo/redo, rounds/shoes | **IMPLEMENTED** | No network dependency in any of these paths; all persisted through Dexie |
| Unified live header (Hi-Lo primary, KO/Zen/Omega II/Aces/Decks secondary) | **IMPLEMENTED** | [`LiveHeader.tsx`](../src/components/live/LiveHeader.tsx), [`CountSummaryPanel.tsx`](../src/components/live/CountSummaryPanel.tsx) |
| Table Edit Mode (deliberate interaction gate for config) | **IMPLEMENTED** | [`TableMap.tsx`](../src/components/live/TableMap.tsx), [`SeatTilesRow.tsx`](../src/components/live/SeatTilesRow.tsx), [`DealerTile.tsx`](../src/components/live/DealerTile.tsx) |
| Dual Operational Roles: Surveillance shell | **IMPLEMENTED** | [`LiveScreen.tsx`](../src/components/live/LiveScreen.tsx) — pre-existing, unchanged |
| Dual Operational Roles: Floor Mode minimal shell | **IMPLEMENTED (foundation)** | [`FloorScreen.tsx`](../src/components/live/FloorScreen.tsx), route at `app/investigations/[id]/floor/page.tsx`, reached from Surveillance via the "Floor Mode" entry in [`LiveMenu.tsx`](../src/components/live/LiveMenu.tsx). Reuses `InvestigationContext`, the CardEvent ledger, `CardEntryPad`, `RoundControlsRow`, `ActiveSeatHeader`, `CountSummaryPanel`, and `VoiceControl` unmodified — no parallel state, no duplicated count logic. Deliberately minimal: no table graphic, wager panel, or player-actions row yet (see §4) |
| Voice: one-tap continuous listening ON/OFF | **IMPLEMENTED** | [`hooks/useVoiceRecognition.ts`](../src/hooks/useVoiceRecognition.ts), [`components/live/VoiceControl.tsx`](../src/components/live/VoiceControl.tsx) |
| Voice: structured card/target commands (exact phrase + noisy-token fallback) | **IMPLEMENTED** | [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts) |
| Voice: ambiguous-input rejection (never guess) | **IMPLEMENTED** | `extractFromNoisyTokens` ambiguity rule in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts) |
| Voice: no duplicate/replayed CardEvents across restarts or interim/final overlap | **IMPLEMENTED** | Session-scoped dispatch guard in [`hooks/useVoiceRecognition.ts`](../src/hooks/useVoiceRecognition.ts) — see "session/dispatch guarantees" tests |
| Voice: "C1"→Seat 1 style recognition-artifact normalization | **IMPLEMENTED** | `seatFromCToken` in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts), scoped to active target context only |
| Voice: "spot" as a seat-prefix synonym alongside "seat"/"player" | **IMPLEMENTED** | `SEAT_PREFIX_WORDS` in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts) |
| Voice: "next seat" workflow command | **IMPLEMENTED** | Alias for the existing "next" command (same `advanceToNext`/`nextRound` dispatch) — `WORKFLOW_WORDS` in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts) |
| Voice: deterministic safety boundary — a card word inside ordinary sentence structure never creates a CardEvent | **IMPLEMENTED** | `MAX_NOISE_TOKENS` / stray-token cap and failed-target-attempt rejection in `extractFromNoisyTokens`, [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts) — this is the category-A boundary from §12, not the B/C classifier itself |
| Voice: offline/no-network handling (bounded retries, clear "Voice Unavailable" state, investigation unaffected) | **IMPLEMENTED** | `MAX_CONSECUTIVE_NETWORK_ERRORS` logic in [`hooks/useVoiceRecognition.ts`](../src/hooks/useVoiceRecognition.ts), persistent notice + retry in [`components/live/VoiceControl.tsx`](../src/components/live/VoiceControl.tsx) |
| Voice: blank/whitespace-only final transcript is a silent no-op | **IMPLEMENTED** | Early-return guard in `handleFinalResult`, [`components/live/VoiceControl.tsx`](../src/components/live/VoiceControl.tsx) — distinct from a genuine "Not recognized" rejection |
| Voice: read-only "Count"/"Status" commands with spoken (headset) feedback | **IMPLEMENTED (foundation)** | Parser kinds in [`lib/voice/parseVoiceCommand.ts`](../src/lib/voice/parseVoiceCommand.ts); text built from the existing CountSnapshot in [`lib/voice/spokenSummary.ts`](../src/lib/voice/spokenSummary.ts) (shares `formatSigned`/`formatTrueCount` with `CountSummaryPanel.tsx` via [`lib/utils/countFormatting.ts`](../src/lib/utils/countFormatting.ts) — no duplicated count/formatting logic); spoken via the feature-detected [`lib/voice/speechOutput.ts`](../src/lib/voice/speechOutput.ts) abstraction; on/off via `voiceAudioFeedback` in [`store/useSettingsStore.ts`](../src/store/useSettingsStore.ts) and Settings. Never mutates investigation state. Platform TTS support/quality is not assumed uniform — see §6 |
| Voice: N-best resolution across every ASR alternative (not just `alternatives[0]`) | **IMPLEMENTED** | [`lib/voice/nBestResolver.ts`](../src/lib/voice/nBestResolver.ts), [`lib/voice/classifyVoiceTranscript.ts`](../src/lib/voice/classifyVoiceTranscript.ts) — scored classification of every alternative; refuses to guess between conflicting valid alternatives without a decisive margin |
| Voice: structured diagnostics (Voice Event ID, pipeline-stage log lines, rejection codes, active-target before/after, timing, session export) | **IMPLEMENTED** | [`lib/voice/voiceEventId.ts`](../src/lib/voice/voiceEventId.ts), [`lib/voice/voiceDiagnosticsTypes.ts`](../src/lib/voice/voiceDiagnosticsTypes.ts), [`components/live/VoiceDiagnosticsPanel.tsx`](../src/components/live/VoiceDiagnosticsPanel.tsx) (Export JSON) |
| Voice: hit/stand/double/split/surrender/insurance commands | **PLANNED** | Not yet in the parser/dispatch; part of the full Voice Control Coverage list in §5 |
| Voice wager mutation ("bet 30", "seat 5 bet 30") | **PLANNED** | Deterministic single-utterance grammar designed (see §14) to reuse the existing `updateSeatAtTarget`/`computeWagerChange` action; not yet wired into the parser or dispatch |
| Voice wager mutation from natural, multi-utterance speech ("Player bet." / "$30." as separate finals) | **FUTURE** | Same class of problem as multi-card streaming below — needs a provably safe cross-utterance commit/dedup strategy first |
| Voice: multi-card sequential/streaming input ("dealer king ace" as two cards, not one ambiguous rejection) | **FUTURE** | Deliberately still rejected (ambiguous, zero CardEvents) pending a deterministic commit/dedup strategy across interim/final revisions and recognition restarts |
| Voice Note Mode (Start Note / End Note / Cancel, verbatim capture) | **IMPLEMENTED** | Note-mode state machine in [`components/live/VoiceControl.tsx`](../src/components/live/VoiceControl.tsx), persisted via existing `addOperatorNote` in [`lib/db/repositories/investigations.ts`](../src/lib/db/repositories/investigations.ts) — no parallel notes architecture |
| Voice: A/B/C real-time speech classification (structured / casino-relevant / irrelevant chatter) beyond the explicit note-mode ritual | **PLANNED** | Only the explicit Start/End Note fallback exists today; no automatic classifier |
| Voice: fully natural conversational capture (no start/end ritual required) | **FUTURE** | Long-term goal per §13 |
| Paraphrase/cleanup layer for notes, distinguishable from original | **FUTURE** | No paraphrasing exists anywhere yet; today's notes are always verbatim, which trivially satisfies "preserve the original" but the cleanup layer itself is not built |
| Player/game tracking: seats, dealer, cards, splits/doubles/surrender/insurance, wagers, timestamps | **IMPLEMENTED** | Core `Investigation`/`Round`/`Seat` model in [`types/investigation.ts`](../src/types/investigation.ts), captured live via `LiveScreen.tsx` and related components |
| Advantage-play: bet size vs. true count correlation (Pearson) | **PARTIAL** | Real, computed (not hardcoded) correlation in [`lib/analysis/apLikelihood.ts`](../src/lib/analysis/apLikelihood.ts) via `computeApLikelihoodBySeat`/`computeApLikelihood`, explicitly documented as a non-accusatory reference indicator — but **not yet surfaced in any UI or in the final report** |
| Advantage-play: bet spread, wager-change timing, strategy-deviation detection, insurance/double/split/surrender analysis, estimated edge, evidence-quality/sample-size indicators | **PLANNED** | `correlationScores: Record<number, CorrelationScores>` exists only as a placeholder field (marked `// Phase 7`) in [`types/investigation.ts`](../src/types/investigation.ts) — not computed or wired up |
| Deep Eye assessment with WHY explanation, wired into UI/report | **PLANNED** | Depends on the above; no assessment surface exists yet |
| Final Investigation Report: operator-authored summary/memo, notes, round-by-round dealer/seat evidence, Complete Investigation | **PARTIAL** | [`components/report/ReportScreen.tsx`](../src/components/report/ReportScreen.tsx) — in-app editable screen exists and covers basic round-by-round facts, but has no player-profile fields (alias/physical description/associates), no count-history/wager-correlation section, no Deep Eye section, and no PDF/print export |
| Report: player-profile fields (alias, physical description, known associates) | **PLANNED** | Not present in `Investigation` type or `ReportScreen.tsx` today |
| Report: PDF / print-ready export | **PLANNED** | No print stylesheet or export path found anywhere in `src/` |
| History / Review of past investigations | **PARTIAL** | [`app/(main)/investigations/page.tsx`](../src/app/(main)/investigations/page.tsx) lists investigations with status/casino/table/round-count and links into the live/report screens — functional but minimal (no search/filter, no report preview from the list) |
| Internal credit (Sidney Impastato — Creator/Developer; Forge — Architect) | **IMPLEMENTED** | Small text line at the bottom of Settings → About, [`SettingsScreen.tsx`](../src/components/settings/SettingsScreen.tsx) |

**Legend:** IMPLEMENTED = built, tested, in the current app. PARTIAL = real, working groundwork exists but does not yet fulfill the full requirement. PLANNED = deliberately scoped next work, not yet started. FUTURE = a stated long-term goal, not scoped for near-term work.
