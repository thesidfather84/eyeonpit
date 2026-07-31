# Counting Systems — Developer Reference

Source of truth: `src/lib/counting-engine/` — `countTags.ts` (tags, IRC), `calculateCounts.ts`
(the single running-count calculation, one reducer pass over the ledger), `calculateTrueCount.ts`
(decks remaining, true count, the one display-rounding policy), `ledger.ts` (sequencing,
status transitions), `migration.ts` (legacy recovery for investigations recorded before the
ledger existed). This document describes what that code does and why; if the two ever
disagree, the code is authoritative and this file is stale.

## The card ledger (applies to every system below)

Every exposed card is exactly one immutable `CardEvent` row (Dexie `cardEvents` table,
`src/lib/db/schema.ts`): `{ id, investigationId, shoeNumber, roundId, sequence, targetType,
targetId, rank, status, createdAt }`. `calculateCountSnapshot()` (`calculateCounts.ts`)
dedupes by `id`, keeps only `status: "active"` rows, sorts by `sequence`, and applies every
card to all four counting systems in one pass — the single authoritative calculation, with
no other code path computing a count independently.

The count **never** depends on seat occupancy, current player/seat assignment, visual hand
arrays (`round.seats[n].playerCards`, `dealerHand.cards`), human-readable event-log messages,
component lifecycle, or the persisted `Round.runningCount`/`trueCount` fields. In particular:
marking a seat empty (`markSeatEmpty`) clears that seat's *display* record for the round, but
never touches its CardEvents — cards already exposed stay in the ledger and in every count,
permanently, exactly as they were tapped in.

A card is added via `addCardToRound()` (`src/lib/db/repositories/cardEvents.ts`), which writes
the round's display-array mutation and its CardEvent in the same Dexie transaction — one can
never exist without the other. Undo/redo of a card addition (`undoCardAdd`/`redoCardAdd`) never
deletes the row; it flips `status` between `active` and `undone` for that specific event id,
restoring the round's display snapshot in the same transaction.

**New Shoe** bumps `shoeNumber`, which is all it needs to do: `nextSequence()` (`ledger.ts`)
starts a shoe's sequence at 1 the moment it has zero events, so a new shoe is an independent
sequence by construction, and the old shoe's events are never touched, deleted, or renumbered.

**Legacy investigations** (recorded before the ledger existed) are backfilled once, on first
load, by `ensureLegacyLedger()`: if an investigation has zero CardEvents but has recorded card
activity (structured hand data or "card"-type event-log entries), `recoverLegacyLedger()`
(`migration.ts`) reconstructs one CardEvent per historical card — preferring structured
`playerCards`/`dealerHand.cards` where present (a seat still occupied, or the dealer, which is
never removable), and falling back to parsing that round's event-log "card" messages only for
a target whose structured record is gone (a since-vacated seat). A target is never
reconstructed from both sources at once, so nothing is double-counted. Every event-log-derived
target is flagged in the returned `ambiguities` list — legacy recovery reports uncertainty
rather than inventing certainty, since an undo that happened before a seat was vacated can't be
ruled out from the event log alone. Message-string parsing exists **only** in `migration.ts`;
no other part of the engine ever inspects a message string.

## Hi-Lo (balanced)

| 2-6 | 7-9 | 10-A |
|---|---|---|
| +1 | 0 | -1 |

- **Running count:** `sum(tag(card))`, starting at 0.
- **True count:** `RunningCount / DecksRemaining`, unrounded internally — see Rounding below.
- Reference: Edward O. Thorp / Stanford Wong; taught as the standard entry-level system
  by Blackjack Apprenticeship.

## KO — Knock-Out (unbalanced)

| 2-7 | 8-9 | 10-A |
|---|---|---|
| +1 | 0 | -1 |

- **Running count:** seeded from an Initial Running Count (IRC), then `IRC + sum(tag(card))`.
  - `IRC(decksInPlay) = -4 x (decksInPlay - 1)` — e.g. 0 for a single deck, -20 for a
    6-deck shoe. KO's tags sum to +4 per 52-card deck (unbalanced by design); the IRC
    exactly offsets that so the running count itself, not a converted true count, is
    the number an operator acts on. The one place this is computed: `initialRunningCount()`
    (`countTags.ts`).
- **True count: N/A.** Standard KO methodology never divides by decks remaining —
  dividing an unbalanced count the same way a balanced count is divided produces a
  number with no basis in published KO methodology. `calculateTrueCount()` returns
  `null` for KO; every caller must render that as "N/A" (or omit it), never as `0`
  and never as the running count. A true-counted KO variant, if ever added, must be
  its own separately named `CountingSystem` with its own tag table, not a flag on
  standard KO.
- Reference: Ken Fuchs & Olaf Vancura, *Knock-Out Blackjack*.

## Zen Count (balanced)

| 2-3, 7 | 4-6 | 8-9 | 10-A | A |
|---|---|---|---|---|
| +1 | +2 | 0 | -2 | -1 |

- **Running count:** `sum(tag(card))`, starting at 0.
- **True count:** `RunningCount / DecksRemaining`, unrounded internally — see Rounding below.
- Reference: Arnold Snyder, *Blackbelt in Blackjack*.

## Omega II (balanced)

| 2-3, 7 | 4-6 | 8, A | 9 | 10-K |
|---|---|---|---|---|
| +1 | +2 | 0 | -1 | -2 |

- **Running count:** `sum(tag(card))`, starting at 0.
- **True count:** `RunningCount / DecksRemaining`, unrounded internally — see Rounding below.
- Reference: Bryce Carlson, *Blackjack for Blood*.
- Verified balanced: summed across one full 52-card deck (4 of each rank), the tags
  net to exactly 0 (`+1x2 · 3` ranks `+ +2x3 ranks + 0x2 ranks + -1x1 rank + -2x4 ranks`,
  weighted by 4 cards per rank) — see the full-deck balance test in
  `calculateCounts.test.ts`. (Rank 9 = -1 here, not 0 — the value that distinguishes
  Omega II from Hi-Lo/Zen; a stored `9: 0` would silently unbalance the system by +4
  per deck.)

## True count: divisor and starting value

`decksRemaining = max(MIN_DECKS_REMAINING, (shoeTotalDecks x 52 - exposedCardCount) / 52)`
(`calculateTrueCount.ts`, `computeDecksRemaining()`). `MIN_DECKS_REMAINING = 0.25` — a
documented floor that keeps the divisor large-but-finite near the end of a shoe instead of
letting the true count run toward +/-Infinity over the last few cards.

- At zero cards seen, `decksRemaining === shoeTotalDecks` exactly (e.g. `6.0` for a
  6-deck shoe). There is no cut-card concept anywhere in this formula — penetration
  target/cut-card placement is an operational choice (when the operator taps "New
  Shoe"), not a term in the arithmetic, so the starting divisor is always the
  configured shoe size regardless of where a cut card would sit.
- `exposedCardCount` is the authoritative ledger's active-event count for the shoe —
  never a count of items in a display array.

## Deck estimation method

EyeOnPit does **not** use the traditional live-play heuristic of visually estimating
the discard tray/shoe in half-deck (or quarter-deck) increments — the technique
Blackjack Apprenticeship and similar training teach because a player at a real table
cannot know the exact remaining card count. EyeOnPit can: every card is logged as it's
observed, so `decksRemaining` is computed as an **exact, continuous fraction**, not
rounded to any half-deck grid before use. The true-count *formula* is identical to the
standard one taught everywhere (RC ÷ decks remaining); only the *input precision*
differs, and it is strictly more precise than a human visual estimate, which is the
correct choice for a tool doing after-the-fact reconstruction rather than real-time
table decisions.

## Rounding

The engine (`calculateCounts.ts`, `calculateTrueCount.ts`, `ledger.ts`) never rounds anything
internally — every running count is an exact integer sum, and `calculateTrueCount()` returns
the **exact, unrounded** division. Display rounding happens in exactly one place:
`roundTrueCountForDisplay()` (`calculateTrueCount.ts`) — round-half-away-from-zero to one
decimal place — called only at the point of rendering (`CountSummaryPanel.tsx`'s
`formatTrueCount()`). Nothing upstream of that call ever rounds, and nothing downstream
re-rounds an already-rounded number. `null` (KO, or any unsupported conversion) passes through
unchanged and renders as `"N/A"`.

`formatSigned()` (`CountSummaryPanel.tsx`) renders the rounded number: a leading `+` for values
`> 0`, the bare number otherwise — `0` always renders as `"0"`, never blank or omitted.

**Decks remaining / penetration display only** (`toFixed(1)` / `toFixed(0)` in
`CountSummaryPanel.tsx` / `BottomStatusBar.tsx`): `Number.prototype.toFixed`, which has
its own well-known IEEE-754 representation quirks at exact ties. Since the denominator is 52,
this essentially never lands on an exact display-rounding tie in practice. This only affects
the human-readable "X.X decks left" / "NN%" labels — never the true-count calculation itself,
which always uses the unrounded `decksRemaining` value.

## Shoe penetration

`penetrationPct = min(100, (exposedCardCount / (shoeTotalDecks x 52)) x 100)` — computed
alongside `decksRemaining` from the same ledger query (`BottomStatusBar.tsx`), so the two are
always algebraically complementary: `decksRemaining/shoeTotalDecks + penetrationPct/100 === 1`
at every card count from 0 through a full shoe and beyond.

## References used for verification

- Edward O. Thorp, *Beat the Dealer* (Hi-Lo lineage)
- Blackjack Apprenticeship — Hi-Lo tags, true-count formula (RC ÷ decks remaining),
  and the half-deck visual deck-estimation technique for live play
- Ken Fuchs & Olaf Vancura, *Knock-Out Blackjack* (KO tags and IRC methodology)
- Arnold Snyder, *Blackbelt in Blackjack* (Zen Count)
- Bryce Carlson, *Blackjack for Blood* (Omega II)
- Direct source reading: `src/lib/counting-engine/` (all files), `src/lib/db/repositories/cardEvents.ts`,
  `src/lib/db/schema.ts`, `src/lib/analysis/roundCountSnapshot.ts`, `src/lib/analysis/apLikelihood.ts`,
  `src/components/live/CountSummaryPanel.tsx`, `src/components/live/BottomStatusBar.tsx`,
  `src/lib/db/repositories/investigations.ts` (`splitSeat`, `misdealRound`, `advanceRound`),
  and the `src/lib/counting-engine/*.test.ts` suite.
