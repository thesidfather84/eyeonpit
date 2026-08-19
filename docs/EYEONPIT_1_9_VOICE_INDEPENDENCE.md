# EyeOnPit 1.9 — Voice Independence Architecture (documentation only)

**Status: architecture and roadmap, zero code changes.** This document
designs a `SpeechProvider` abstraction that will let EyeOnPit's voice
pipeline run on a speech-to-text engine other than the browser's built-in
Web Speech API, documents the Firefox/cross-browser gap that abstraction
exists to close, and defines a benchmark methodology for evaluating any
future replacement engine against the current baseline. Per explicit
instruction for this release: **current Voice is not replaced, no
`SpeechProvider` code is added, and Firefox support is not implemented or
faked.** PC Voice Field Test #2 is underway against the existing,
unmodified pipeline — this document does not touch
`src/lib/voice/`, `src/hooks/useVoiceRecognition.ts`, or
`src/components/live/VoiceControl.tsx`, confirmed by `git diff` showing no
changes under those paths.

---

## 1. Why this is architecture, not a rewrite

EyeOnPit's voice safety guarantees — deterministic parsing, no LLM in the
command path, never guessing on ambiguity (`docs/EYEONPIT_PRODUCT_SPEC.md`
§12) — live entirely in `lib/voice/normalizeTranscript.ts`,
`classifyVoiceTranscript.ts`, `nBestResolver.ts`, and `parseVoiceCommand.ts`.
None of that logic cares how a transcript arrived; it only ever consumes
plain text and a ranked list of alternatives. The ONLY component coupled to
the browser's specific Web Speech API is `useVoiceRecognition.ts`, via one
narrow seam: `getSpeechRecognitionCtor()`
(`lib/voice/speechRecognitionTypes.ts`), which reads
`window.SpeechRecognition`/`window.webkitSpeechRecognition` and nothing
else. That narrowness is what makes a provider abstraction viable without
touching the safety-critical parsing stack at all.

## 2. The pipeline, and where a `SpeechProvider` fits

```
MICROPHONE
   │
   ▼
SPEECH PROVIDER            <- NEW seam (documented here, not built)
   │  (raw transcript + n-best alternatives + isFinal)
   ▼
EYEONPIT NORMALIZATION     <- lib/voice/normalizeTranscript.ts (UNCHANGED)
   │
   ▼
NATURAL LANGUAGE RESOLVER  <- classifyVoiceTranscript.ts + nBestResolver.ts
   │                          + parseVoiceCommand.ts (UNCHANGED)
   ▼
SAFETY VALIDATION          <- deterministic, no-LLM, never-guess-on-ambiguity
   │                          rules already enforced inside the resolver
   ▼
CARDEVENT
```

Everything below "Speech Provider" in this diagram is exactly what exists
today, unmodified. The abstraction's entire job is to make "Speech
Provider" a swappable interface instead of a hardcoded browser API call,
so a future engine plugs in at the top of the pipeline without the
normalization/resolver/safety stack ever needing to know which engine
produced the transcript.

## 3. Proposed `SpeechProvider` interface (design only — not implemented)

A future `lib/voice/speechProvider.ts` would define an interface shaped
around what `useVoiceRecognition.ts` already produces and consumes today —
deliberately NOT a redesign of `VoiceResult`/`VoiceAlternative`
(`useVoiceRecognition.ts`), since those types are already the correct
shape for the resolver:

- `start()` / `stop()` — same semantics as the current hook's public API.
- `onFinalResult(result: VoiceResult)` / `onInterimResult?(result:
  VoiceResult)` — identical shape to today's callbacks, so
  `normalizeTranscript`/`classifyVoiceTranscript`/`nBestResolver` need no
  changes regardless of which provider produced the result.
- `onError(error: string)` — the provider translates its own native error
  vocabulary into the same conceptual buckets `FATAL_ERRORS` in
  `useVoiceRecognition.ts` already distinguishes (permission refusal,
  unsupported, transient) rather than inventing a second error taxonomy
  the rest of the app would need to learn.
- `onLifecycleEvent?(event: VoiceLifecycleEvent)` — diagnostic-only, same
  as today; a provider that can't report a given lifecycle stage simply
  never fires it, exactly as "not every engine fires every one of these;
  absence is itself diagnostic information" already documents for the
  current browser engine.
- `suppressForSpeech()` / `resumeAfterSpeech()` — the TTS self-hearing
  mute described in `useVoiceRecognition.ts`; any provider must support a
  clean pause/resume that does not toggle "voice mode" off, since
  `VoiceControl.tsx` relies on that distinction today.

`useVoiceRecognition.ts` would become one concrete `SpeechProvider`
implementation (`BrowserWebSpeechProvider`) wrapping the exact same
`getSpeechRecognitionCtor()` call it makes today, selected as the default
and, for this release, the ONLY implementation that exists. A future
`EyeOnPitControlledSTTProvider` (§5) would be a second implementation of
the identical interface — never a fork of the resolver/safety stack.

**Why not build this now:** introducing an interface with exactly one real
implementation and no second consumer is speculative abstraction ahead of
need. The value of documenting it here is that it gives the *next* voice
task (implementing a second provider) a seam to build against instead of
a from-scratch design exercise, and it makes explicit — for review — that
the safety-critical parsing stack requires zero changes to support it.

## 4. Firefox / cross-browser gap (documented, not fixed)

**Current state:** `getSpeechRecognitionCtor()` requires
`window.SpeechRecognition` or `window.webkitSpeechRecognition` to exist.
Desktop and Android Chrome and Edge ship the prefixed constructor; Safari's
support has varied by version. **Firefox does not ship a Web Speech API
recognition constructor** — `getSpeechRecognitionCtor()` returns
`undefined` there today, and `useVoiceRecognition.ts`'s existing
`"unsupported"` error path (already a `FATAL_ERRORS` member, never
auto-retried) is what an operator on Firefox sees now: voice is cleanly
unavailable, the rest of the investigation continues through manual
controls untouched. This is the correct DEGRADED behavior for the current
architecture — it is not a bug, but it is also not cross-browser voice
support.

**Target browser matrix for future cross-browser voice:**

| Browser | Today | Path to support |
|---|---|---|
| Chrome / Chromium desktop | ✅ native Web Speech | `BrowserWebSpeechProvider` (current, unchanged) |
| Edge | ✅ native Web Speech | `BrowserWebSpeechProvider` (current, unchanged) |
| Safari / iOS | Partial, version-dependent | `BrowserWebSpeechProvider` where available; falls back to `"unsupported"` otherwise, same as today |
| Firefox | ❌ no native constructor | Requires a non-`BrowserWebSpeechProvider` implementation — an EyeOnPit-controlled STT provider (§5) is the only realistic path, since Firefox has no equivalent browser API to wrap |
| Future installed/PWA build | N/A today | Same requirement as Firefox — a packaged app cannot assume a specific browser's built-in engine either |

**Do NOT fake Firefox support:** the correct interim behavior for Firefox
remains exactly what `useVoiceRecognition.ts` already does —
`"unsupported"`, no retry loop, voice mode cleanly off, manual entry fully
functional. Firefox users are not blocked from using EyeOnPit; they are
blocked from using *Voice* until a non-browser-dependent provider exists.

## 5. Future EyeOnPit-controlled STT provider (design intent, not built)

The second `SpeechProvider` implementation this architecture anticipates
is one where EyeOnPit controls the recognition engine directly (e.g. a
hosted or on-device STT model) rather than depending on whichever engine a
given browser happens to ship. This is what actually closes the Firefox
gap in §4, and it is also the only path to a possible future local/on-prem
deployment (relevant for casino-surveillance environments where sending
audio to a third-party cloud recognizer may not be acceptable — a
constraint the current `BrowserWebSpeechProvider` inherits from whatever
policy the browser vendor's own recognition backend uses, invisibly, today).
Two shapes are both consistent with the `SpeechProvider` interface in §3
and neither is chosen here:

- **EyeOnPit-hosted STT** — audio streamed to infrastructure EyeOnPit
  controls, giving control over model choice, vocabulary tuning (casino/
  blackjack terms), and data handling policy, at the cost of a network
  dependency the current architecture doesn't have (today's Web Speech
  usage already depends on the browser vendor's own backend for most
  engines, so this is a change of *who* runs the network dependency, not
  an entirely new category of risk).
- **Local/on-device STT** — a model running on the operator's own device,
  removing the network dependency and any third-party data-handling
  question entirely, at the cost of model size/accuracy/latency
  trade-offs that would need real measurement (§6) before being trusted
  for a surveillance workflow.

Neither is implemented, prototyped, or scaffolded in this release. Which
one (or both) is pursued is a future decision this document deliberately
does not make.

## 6. Voice benchmark corpus (design only — not built)

Before any replacement or additional provider is approved for production
use, it must be measured against the current `BrowserWebSpeechProvider`
baseline using a shared benchmark corpus and methodology, not spot-checked
anecdotally. Proposed structure, mirroring the existing pattern of
`src/proxy.test.ts` and the voice test suite's own regression-corpus style
(`lib/voice/*.test.ts`, PC Field Test findings already captured as named
test cases):

**Corpus composition** — real, captured or realistic utterances across:

- Target selection: dealer, seat 1–7, by number and natural phrasing.
- Card rank: every rank word and its known ASR confusions.
- Complete compound commands: target + rank in one utterance ("seat one
  has a seven"), and PC-field compact narration forms ("seat 1:9").
- Known adversarial/confusion cases already on record from Field Test #1
  and #2 (dealer misheard as "Taylor"/"Spotify"; player-target phrases
  misheard as "play your"; other name-collision ASR errors).
- Deliberately unrelated speech that must NOT produce a CardEvent (the
  "Spotify is dead" class of test already in `VoiceControl.test.tsx`).
- Background-noise and compound/multi-clause narration samples.

**Metrics measured per candidate provider, against the same corpus:**

- Target accuracy (correct seat/dealer resolved).
- Card-rank accuracy.
- Complete-command accuracy (target AND rank both correct in one
  utterance).
- False CardEvents produced (a command committed that should not have
  been — the highest-severity failure class, since it silently corrupts
  the count).
- Valid commands incorrectly rejected (false negatives — costs operator
  time but never corrupts data).
- Dealer→"Taylor"/"Spotify"-class misrecognition rate specifically
  (named because it's a confirmed recurring real-world failure mode, not
  a hypothetical one).
- Player-target ASR error rate (the "play your" class of confusion).
- Latency: time from utterance end to `onFinalResult`.
- `ASR_NO_FINAL` rate (recognition that never produces a final result at
  all — a real, already-observed failure mode distinct from
  misrecognition).
- Accuracy under background noise (casino floor conditions, not a quiet
  room).
- Compound/multi-clause narration accuracy specifically (the hardest
  class, per Field Test findings).

**Approval gate, stated explicitly:** no replacement or additional
`SpeechProvider` implementation is approved for production use until it
beats or materially complements the current `BrowserWebSpeechProvider`
baseline on this corpus, safely — a provider that improves accuracy but
increases false CardEvents is a regression, not an improvement, because a
false CardEvent corrupts count data silently while a rejected valid
command only costs operator time. This mirrors the same asymmetry already
built into the current resolver's own design (`nBestResolver.ts`: refusing
to guess is always preferred over a wrong guess).

## 7. Explicitly deferred — not part of this release

- No `SpeechProvider` interface file, type, or implementation exists in
  the codebase after this patch.
- No Firefox support — `getSpeechRecognitionCtor()` and
  `useVoiceRecognition.ts` are unmodified; Firefox continues to hit the
  existing `"unsupported"` path.
- No benchmark corpus data files, harness, or test runner — §6 is a
  methodology design, not a built tool.
- No fix for any PC Voice Field Test #2 finding (dealer→Taylor/Spotify,
  player→"play your", `ASR_NO_FINAL`, compound narration failures,
  active-target continuation gaps, `CONTROL_DISABLED` behavior) — those
  remain open findings against the current, unmodified baseline by
  explicit instruction, so Field Test #2 measures a clean, unchanged
  pipeline.
- Zero changes under `src/lib/voice/`, `src/hooks/useVoiceRecognition.ts`,
  `src/components/live/VoiceControl.tsx`, or any voice-adjacent test file
  in this document's scope.
