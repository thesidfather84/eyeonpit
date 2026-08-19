# EyeOnPit 1.9 — Operator Lifecycle + Global Terminology

**Status: implemented and tested, pending review.** This document describes
the investigation lifecycle rule (READY / ACTIVE / PAUSED / COMPLETED),
the clean-launch and recovery behavior it enforces, and the global
Spot-everywhere operator terminology standard introduced in 1.9. Per
explicit instruction for this release, the voice parser/resolver/
normalization, browser ASR behavior, CardEvent ledger behavior, and all
counting/simulation/Counter Detection mathematics are completely
unmodified — every change described here is presentation-layer routing and
display text only.

---

## 1. The lifecycle rule

`Investigation.status` (`src/types/investigation.ts`) already had exactly
the four states this rule needs — no schema change was required:

| Status | Operator-facing meaning |
|---|---|
| `"draft"` | Vestigial — confirmed unreachable through any real UI path today. Not used by any 1.9 code. |
| `"active"` | ACTIVE — the operator is currently working this investigation. |
| `"paused"` | PAUSED — set aside mid-investigation, recoverable. |
| `"closed"` | COMPLETED — historical. Per this priority's core rule, **never** the operational working state again. |

The rule this release enforces: **`"active"`/`"paused"` are candidates for
the live operational workspace; `"closed"` never is, by construction.** A
`"closed"` investigation can only ever be reached through
`InvestigationReportsView` (§4) — a read-only report surface, never the
live console.

## 2. Root cause of the pre-1.9 behavior

Before this release, `useActiveInvestigation.ts` (used only by
`NavigationDrawer`'s own "jump to whatever's active" menu link) correctly
excluded `"closed"` investigations, but **nothing else in the app ever
checked investigation status before rendering the live console.**
Specifically:

- `ConsoleShell` (the `/app` entry point) had no lifecycle logic at all —
  whatever investigation last existed simply rendered.
- The `/investigations/[id]/live` route (reached via History links,
  bookmarks, or the End Investigation redirect) had **no status guard**:
  a `"closed"` investigation rendered the full live console — TableMap,
  ActiveSeatHeader, CardEntryPad, RoundControlsRow, VoiceControl, all of
  it — with only the header's "+New" button acknowledging closure. This
  is also the direct root cause of §9's screenshot regression: that live
  console still used `SeatTilesRow`'s pre-1.9 default terminology.
- A reload after finalizing a report re-mounted whatever component last
  happened to be showing, with no independent check that the investigation
  underneath it was actually still open.

None of this was a data bug — `CardEvent`s, reports, and investigation
records were always correctly persisted and correctly marked `"closed"`.
It was purely a **routing/presentation gap**: nothing asked "is this
investigation still open?" before deciding what to render.

## 3. Clean READY state and active-investigation recovery

`src/lib/investigationLifecycle.ts` — a pure, tested classification
function, `resolveActiveInvestigationState(candidates, now)` — is the
single source of truth for "what should the app show right now?" It never
touches routing or components; `src/hooks/useInvestigationLifecycleState.ts`
is the thin hook wrapper that feeds it live data from
`listInvestigations()`, and `ConsoleShell.tsx` (`src/components/live/
ConsoleShell.tsx`) is the one place its result is acted on.

Classification, given every currently `"active"`/`"paused"` investigation
(closed ones are never candidates):

- **Zero candidates → `"none"`.** `EmptyConsole` renders: EyeOnPit
  header, QUICK / FLOOR / ADVANCED / PRACTICE, nothing else. No stale
  players, spots, dealer cards, wagers, or round state — there is
  nothing left over to show, because the component itself carries no
  investigation-specific state.
- **Exactly one candidate, updated within the last
  `ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS` (12 hours) → `"fresh"`.**
  `InvestigationConsole` renders it directly, with no confirmation step —
  this is what makes refresh, browser crash, tab closure, and accidental
  navigation transparently recoverable, exactly as before this priority.
- **Anything else (one stale candidate past the freshness window, OR two
  or more candidates regardless of freshness) → `"recoverable"`.**
  `ResumeOrNewScreen` (`src/components/live/ResumeOrNewScreen.tsx`) is
  shown instead of silently entering anything: "RESUME INVESTIGATION
  {displayId}" with a last-updated timestamp as the primary action,
  "START NEW INVESTIGATION" as a clearly secondary action (explicit copy:
  "{displayId} stays saved in History either way" — starting new never
  destroys or touches the stale one), and a small "View History" link for
  anything not surfaced as the resume candidate.

This directly implements the stale-data safety rule: a very old unfinished
investigation never silently becomes today's working table, and when
state is ambiguous the operator is asked, never guessed for.

**12-hour window rationale:** long enough that an operator's normal
within-shift refresh/crash/tab-close never interrupts them with an extra
tap, short enough that an investigation left open from a prior day is
never mistaken for "still today's table." This is a conservative,
documented choice, not a hardcoded accident — it lives in one named
constant (`ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS`) so it can be
revisited without touching any classification logic.

## 4. End Investigation → paperwork → finalize → clean READY

The workflow: ACTIVE INVESTIGATION → End Investigation (`LiveMenu.tsx`'s
`handleEndInvestigation`, unchanged in this release except dropping the
now-redundant `?review=1` query param — see §5) → the investigation's
`status` becomes `"closed"` → **Final Paperwork/Report** → **Finish &
Start New Investigation**.

`InvestigationReportsView.tsx` (new, extracted from what was previously
inlined only in `LiveMenu`'s "Reports" BottomSheet overlay) is the one
shared report composite — `EventLogPanel` + `BottomStatusBar` +
`AnalysisScreen` + `ReportScreen` — now rendered directly as the body of
`LiveScreen`/`FloorScreen` whenever `investigation.status === "closed"`,
and still reused by `LiveMenu`'s own "Reports" overlay for an
already-open investigation reviewing its own live progress. One component,
two call sites, guaranteed feature parity — the closed-investigation view
was never a stripped-down version of the richer overlay.

**The underlying historical investigation/report is never cleared** —
finalizing a report only changes `status`; every `CardEvent`, wager
record, and round is untouched and remains exactly what the report is
built from.

`ReportScreen.tsx`'s closed-state section gained a **"Finish & Start New
Investigation"** primary action: `window.location.href = "/app"` — a full
page navigation, deliberately, matching the same pattern
`LiveHeader.tsx`'s "+New" button and `LiveMenu.tsx`'s
`handleEndInvestigation` already used. A full navigation is what
guarantees every piece of in-memory operational state (active Spot, dealer
target, visible cards, current hand, round, wager-entry state, transient
controls, temporary report-workflow state) is genuinely gone, not just
visually reset — there is no leftover React state tree for a stale value
to hide in.

## 5. Reload-after-completion regression coverage

Landing back on `/investigations/{id}/live` after finalizing — whether via
reload, a bookmark, or a History link — now goes through the exact same
`isClosed` check inside `LiveScreen.tsx`/`FloorScreen.tsx`:
`investigation.status === "closed"` → render `InvestigationReportsView`
directly, in place of the entire live tree. This is driven **purely by
persisted `status`**, never by a query parameter or one-shot flag — the
previous `AutoOpenReviewFromQuery` mechanism (`?review=1`, consumed once
from `LiveMenu.tsx`) is fully removed as redundant, since status-based
rendering makes it unreachable-but-still-correct in every case that
mechanism used to handle, and removes a class of bug (the "stuck-open
overlay" issue the mechanism's own history references) by construction:
there is no overlay left to get stuck, because a closed investigation
never renders the live console underneath it at all anymore.

Regression test: `ConsoleShell.test.tsx`'s "reload-after-completion
regression (PRIORITY 1.9-8)" suite seeds a `"closed"` investigation via
the real repository (`completeInvestigation`), then mounts a fresh
`ConsoleShell` exactly as a real page reload would, and asserts the clean
READY screen renders — no `ENTER CARD`, no `RESUME INVESTIGATION`.
`EndReview.test.tsx` covers the same guarantee at the `LiveScreen` level:
a closed investigation's report content has no dismiss control, because
it isn't an overlay at all.

## 6. Investigation History — unaffected, confirmed

Completed investigations remain fully viewable, reportable, exportable,
and auditable through `/investigations` (History) exactly as before this
release — nothing in this priority touches `InvestigationsListScreen`,
`listInvestigations()`, or any export/report-building code. This priority
only changed **where a closed investigation is *not* allowed to
resurface** (the live operational console); it never restricts where
closed investigations legitimately remain visible.

## 7. Global operator terminology: Spot, not S1–S7 / Seat

**The rule (verbatim intent):** no normal operator-facing surface may
display bare `S1`...`S7`. Standard operator-facing terminology is `Spot
1`...`Spot 7`. Internal identifiers (`seatNumber` props, Dexie keys,
`activeTarget` values, canonical export fields like `SEAT1`) remain
exactly what they were — this is a display-layer rule, not a data-model
rename.

**Two product principles this codifies** (§8 below has the full set):
*Internal identifiers belong to EyeOnPit. Casino language belongs to the
operator.*

### 7.1 What changed, and what deliberately didn't

Prior to this release, Floor Mode already said "Spot" while Surveillance
(the default live console) said "Seat" — a deliberate, tested split built
in an earlier session. **1.9 supersedes that split**: Spot is now the
single global default across both shells, because the global rule this
release establishes (no surface may default to Seat/S1-7) is a stricter,
later instruction than the earlier Floor/Surveillance divergence.

- `ActiveSeatHeader.tsx`, `CardEntryPad.tsx` — `terminology` prop default
  flipped from `"seat"` to `"spot"`. The prop itself, and its ability to
  render the OTHER word when explicitly passed `"seat"`, is unchanged —
  this is a default flip, not a removal. That prop is exactly the seam
  `docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §3.1 already identified as
  where a future property-level `resolveTerminology()` preference would
  plug in; 1.8's own §3 text describing the old `"Seat"` default is now
  historical — the live default is `"spot"` as of this release.
- `SeatTilesRow.tsx` — every hardcoded "SEAT" string (tile labels,
  aria-labels, the "Manage Seats" button) → "SPOT"/"Manage Spots". This
  file is the direct root cause identified in §9 below.
- `lib/utils/cardEntryResolution.ts` — `targetLabel`/`eventMessage`
  strings ("SEAT N added..." → "SPOT N added...") — see §7.2 for why
  fixing this one shared file was sufficient to correct voice-triggered
  text too, without touching any voice file.
- `ManageSeatsSheet.tsx`, `QuickBetPanel.tsx`, `PlayerActionsRow.tsx`,
  `PlayerDetailSheet.tsx`, `SeatMoreActionsSheet.tsx`,
  `SeatOptionsSheet.tsx`, `TableEventsSheet.tsx`,
  `AnalysisScreen.tsx`, `ReportPreview.tsx`, `exportRtf.ts`,
  `SettingsScreen.tsx` — every operator-visible "Seat"/"SEAT" string
  fixed to "Spot"/"SPOT".
- `lib/terminology.ts`'s `CASINO.playerPosition`/`currentPlayer` fields
  updated for future-consistency (confirmed currently unused/dead code
  anywhere in the app today — updated so a future consumer inherits the
  correct default rather than a stale one).

**Deliberately NOT changed:** every internal identifier — `seatNumber`
props, Dexie `seat` keys, `activeTarget` numeric values, canonical export
identifiers such as `SEAT1`/`S1` in raw developer diagnostic exports.
Per explicit instruction, those remain engineering diagnostics; the
operator-facing summary/feedback layer translates them, the underlying
identifier never changes shape.

### 7.2 How voice-triggered text was fixed without touching voice files

`lib/utils/cardEntryResolution.ts` is a pre-existing, deliberately
**shared** (not voice-specific) utility — its own doc comment already
established it as the single source of truth for both manual entry
(`useCardEntry`) and voice-triggered entry's target labels and toast/
confirmation text, specifically to prevent the two surfaces from drifting
apart. Fixing the display strings there was sufficient to correct
voice-triggered confirmations and toasts too, entirely through that
existing shared seam — confirmed safe via a full, unmodified
`VoiceControl.test.tsx` run (177/177 passing) with **zero changes to
`VoiceControl.tsx` or any file under `lib/voice/`**, only the display-text
assertions in that test file itself needed updating (SEAT→SPOT in
expected toast strings), matching the "do not modify voice
parser/resolver/normalization" constraint exactly.

### 7.3 Terminology leak regression tests

`src/components/live/terminologyLeak.test.tsx` (new) renders real operator
surfaces — `LiveScreen`, `FloorScreen`, `ReportPreview` (with 1.7
Counter-Analysis attached) — against a live, occupied investigation, and
scans **rendered DOM text** for `/\bS[1-7]\b/`, a word-boundary-anchored
pattern chosen specifically so it does not false-positive on legitimate
substrings like `S17` (the dealer-stands-on-17 rule label: no word
boundary exists between the `1` and the `7`, so the pattern correctly
skips it — and the test explicitly asserts `S17` IS present, so the
negative assertion is proven meaningful rather than vacuous). A second
test confirms clicking a "Spot 5" tile still sets the real internal
`activeTarget` to `5` — display text changed, internal IDs did not. These
tests intentionally query rendered container text rather than
`getByText`/`findByText` page-wide lookups where a label legitimately
appears in more than one place at once (e.g. both the active-target
header and the table-map tile show "Spot 3" simultaneously) — a page-wide
single-element query would spuriously fail on "found multiple elements,"
not because of a real leak.

## 8. Product principles (added explicitly, per this release)

Added to `docs/EYEONPIT_PRODUCT_SPEC.md`:

- **The observer should not have to learn EyeOnPit language. EyeOnPit
  should understand casino-surveillance language.**
- **Internal identifiers belong to EyeOnPit. Casino language belongs to
  the operator.**
- **Completed investigations belong in history, not in the live
  operational workspace.**

## 9. Screenshot regression — root cause (PRIORITY 1.9-15)

Recent production testing showed "SEAT 1", "SEAT 2", "SEAT 3"... visible
on an operational screen despite Floor Mode already having been
standardized to Spot in an earlier session. Root cause: that screenshot
was **Surveillance's own live console** (`ActiveSeatHeader`/
`SeatTilesRow`), which — before this release — still defaulted to
`terminology: "seat"` by design, because the earlier session's standard
was "Floor says Spot, Surveillance says Seat" (a deliberate, tested
split at the time). It was not a bug relative to that earlier standard;
it is non-compliant relative to *this* release's new global rule, which
explicitly supersedes the split. §7.1 above is the fix: Surveillance's
`ActiveSeatHeader`/`CardEntryPad`/`SeatTilesRow` now default to
`"spot"` identically to Floor Mode, with `SeatTilesRow.tsx` — the
component that produced the literal on-screen "SEAT N" tile text in the
screenshot — being the direct, confirmed source.

## 10. READY / active-investigation UX (Priority 16/17)

`EmptyConsole` (READY) and `ResumeOrNewScreen` (recovery) are both
deliberately minimal: a header with just a menu button, the EyeOnPit
mark, and 2–4 real actions — never a dashboard of cards/widgets. Recent/
history access is a single small link, secondary to the primary action in
both screens, per explicit instruction.

Investigation state visibility (§17): once inside `InvestigationConsole`,
`LiveHeader` keeps the investigation's human-readable `displayId` visible
at all times — unchanged by this release, already satisfied by existing
UI, confirmed by inspection rather than needing a new component.

## 11. Deferred / not built in this release

- Voice Independence architecture — see
  `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` (documentation only, zero
  voice code, per explicit instruction).
- Any fix for PC Voice Field Test #2 findings — explicitly deferred so
  Field Test #2 measures a clean, unmodified baseline.
- Wiring 1.8's `resolveTerminology()` property preference into the
  `terminology` prop's default — the prop's default changed (Seat→Spot),
  but it is still a hardcoded default, not yet property-configurable;
  that remains 1.8 §3.1's own follow-on work, unstarted.
- `lib/terminology.ts`'s `CASINO` constant fields were corrected for
  future-consistency but remain unconsumed by any live component today —
  confirmed dead code, not newly wired up in this release.
