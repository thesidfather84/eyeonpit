# EyeOnPit — Roadmap

This tracks what's actually been shipped and what's actively planned, at the
milestone level. It is not a design document — for product direction and
requirements, see `docs/EYEONPIT_PRODUCT_SPEC.md`; for day-to-day usage, see
`docs/EYEONPIT_OPERATOR_MANUAL.md`; for user-facing release history, see the
public [Release Notes](../src/app/(site)/docs/release-notes/page.tsx) page.
This file is the internal, engineering-facing companion to that page — same
history, aimed at contributors rather than operators.

---

## Completed

### PC Field Test #1 Fixes — Canonicalization, ASR Normalization, Dealer Recovery (2026-08-18)

**Problem:** the very first PC field test of the diagnostic system above
surfaced a real resolver bug and several unhandled ASR patterns:

- A confirmed N-best bug (V-000006/V-000018): "seat one has a five" was
  correctly heard, but the resolver compared narration's and legacy's
  differently-shaped representations of the SAME resulting action as
  string keys, saw them as distinct, and rejected as
  `CONFLICTING_ALTERNATIVES`.
- Chrome's PC/headset speech recognizer showed additional recurring
  misreadings not yet handled: "seat" as "set"/"seet"/"ceit"/"see"/"cheap";
  "seat five" as "T5"/"C5"/"cheap 5"; "has" as "as"; "eight" as "eighth";
  and compact punctuated forms ("seat 1:9", "seat 1/9").
- "dealer" repeatedly misheard as "Taylor" or "Spotify" with **no**
  alternative containing the literal word "dealer" at all — the existing
  N-best resolver had nothing to fall back to in that situation.

**What shipped:**

- **Action canonicalization** (`classifyVoiceTranscript.ts`) — narration ops
  and legacy commands describing the identical resulting action now always
  produce the same `actionKey`/`summary`, regardless of which parser
  produced them or whether one representation carries redundant
  target-selection metadata. This is the actual fix for the V-000006 bug.
- **Blackjack-specific ASR normalization** (`normalizeAsrSeatArtifacts` in
  `parseVoiceCommand.ts`) — "set"/"seet"/"ceit"/"see"/"cheap" recognized as
  "seat" ASR artifacts under the same seat-number-lookahead safety guard as
  the existing "play"/"start" rules; "eighth" added as a rank word;
  deliberately did NOT add "ate" (common past-tense-verb collision risk —
  see the field-test report for the rationale). "as" added as a narration
  hand-connector (the "has"->"as" ASR pattern), gated on an
  already-established target exactly like every other connector word.
- **Compact narration forms** — "S1"/"T5" letter-prefix seat tokens
  (symmetric with the existing "C1" artifact — `seatFromLetterToken`), and
  `:`/`/` folded into ordinary punctuation stripping so "seat 1:9"/"seat
  1/9" tokenize identically to "seat 1 9".
- **Contextual dealer-confusion recovery** (`tryDealerConfusionRecovery` in
  `classifyVoiceTranscript.ts`, invoked only as nBestResolver's last resort
  when EVERY alternative has already failed ordinary classification) — a
  named, closed list of confusion tokens (`DEALER_ASR_TAYLOR`,
  `DEALER_ASR_SPOTIFY`), rescued to a dealer card ONLY when the transcript
  matches a narrow `<token> <connector> (a|an)? <single rank>` shape with no
  other explicit target present. Every recovery is logged with its specific
  rule ID — never a silent guess.
- **Diagnostic logging enrichment** — VoiceControl's `PARSE ALT` lines now
  show which normalization rule fired and why, the resolver score, and
  (when applicable) which recovery rule rescued the result.

**Explicitly refused:** a general fuzzy/phonetic target matcher; blindly
mapping every "Taylor"/"Spotify" occurrence to "dealer"; adding "ate" as a
rank word. See the field-test report for the full list of what was
deliberately left ambiguous/rejected and why.

**Tests:** ~55 new regression tests covering every confirmed field failure
from this round (including the exact V-000006/V-000018 shape, all four
required-recoverable Taylor/Spotify examples, and all four
required-to-remain-rejected examples). Full suite: 880 passed, 1
pre-existing skip, zero regressions. Counting engine and recognition
lifecycle untouched.

**Status:** approved and pushed to master. Next step is PC Field Test #2 —
a fresh diagnostic export, compared against this round's fixes, before any
further voice changes.

### Voice Reliability + Advanced Diagnostic System (2026-08-18)

**Problem:** field reports showed the correct recognition result was
sometimes the speech engine's *second*-ranked alternative, not its first —
but `VoiceControl` only ever parsed `alternatives[0]`. Every other
alternative was logged for diagnostics and then discarded. There was also no
way to correlate ASR/parse/resolve/commit/TTS events for a single utterance,
no structured rejection codes, and no way to export a session for offline
review.

**What shipped:**

- **N-best resolution** (`lib/voice/nBestResolver.ts`,
  `lib/voice/classifyVoiceTranscript.ts`) — every alternative the recognizer
  returns is now independently classified and scored; the resolver picks the
  only valid one, or the one multiple alternatives agree on, or refuses to
  guess when alternatives conflict without a decisive margin. Scoped to the
  ordinary command-dispatch path only — note-mode dictation and a pending
  New Shoe/End Investigation confirmation still read `alternatives[0]`
  only, deliberately (see the module's own doc comment).
- **Structured diagnostics** — a Voice Event ID (`lib/voice/voiceEventId.ts`)
  now correlates every event about one utterance; rejections carry a
  machine-readable code (`lib/voice/voiceDiagnosticsTypes.ts`) alongside the
  existing human-readable text; active target before/after and per-stage
  timing are now logged.
- **Developer diagnostics UI** (`components/live/VoiceDiagnosticsPanel.tsx`)
  — a "latest utterance" detail view (every alternative + confidence, the
  winner, active target before/after, timing, outcome/code) above the
  existing raw log, plus a new **Export JSON** button.
- **`"start 3 as a 7"` normalization** — `"start"` recognized as an ASR
  artifact for `"spot"`, under the same seat-number-lookahead safety guard as
  the existing `"play"`→`"player"` rule.
- **`ASR_NO_FINAL` diagnostic** — a recognition session that ends without
  ever producing a final result is now explicitly logged, surfacing the
  "correct interim, no final" class of field report instead of failing
  silently.

**Explicitly not touched:** the deterministic counting engine, count rules,
and the recognition restart/session lifecycle in `useVoiceRecognition.ts`
(audited, found already correct, left alone).

**Tests:** 45 new (resolver, classifier, integration, additional parser
regression variants). Full suite: 826 passed, 1 pre-existing skip, zero
regressions. See the release-notes entry (site) and the full engineering
report in the PR/commit history for root-cause analysis and the iPhone
field-test procedure.

**Status:** approved for field testing. Next step is real-device iPhone
testing using the new Export JSON diagnostic output — see
`docs/EYEONPIT_OPERATOR_MANUAL.md` and the Troubleshooting page for how to
use it.

---

## Next Up

- **PC Field Test #2** — collect a fresh diagnostic export and compare it
  against the Field Test #1 fixes above before making any further voice
  changes.
- **Real iPhone field testing** of the voice diagnostics/N-best/PC-field-fix
  work, using Export JSON to capture and review field sessions — still
  pending, now against this additionally-hardened baseline.
- **1.5 reporting work** — paused for the duration of the voice reliability
  effort above; resumes once field testing confirms the diagnostic system
  and N-best resolver hold up under real conditions.

## Longer-Term / Not Yet Scheduled

See `docs/EYEONPIT_PRODUCT_SPEC.md`'s Implementation Status Matrix for the
full list of **PLANNED**/**FUTURE** capabilities (voice wager mutation,
hit/stand/double/split/surrender/insurance voice commands, fully natural
conversational capture, etc.) — that matrix is the authoritative source for
long-range voice scope; this roadmap only tracks active/near-term work.
