"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Mic, Square, SkipForward, ArrowRight, Download, Copy, Check, X } from "lucide-react";
import { createSherpaOnnxProvider, resolveDefaultAssetBaseUrl } from "@/lib/voice/sherpaOnnxProvider";
import { createBrowserWebSpeechProvider } from "@/lib/voice/browserWebSpeechProvider";
import { buildHotwordList } from "@/lib/voice/casinoVoiceContext";
import { classifyVoiceTranscript } from "@/lib/voice/classifyVoiceTranscript";
import type { SpeechProvider, SpeechProviderResult } from "@/lib/voice/speechProvider";
import { DEFAULT_AB_CONFIG, resolveAbConfigProviderOptions, computeAggregatesByConfig, type AbConfig } from "@/lib/voice/sherpaAbTestHarness";

/**
 * SHERPA REAL MIC FIELD TEST — ASR + SAFETY-PIPELINE EVALUATION, LAB ONLY.
 *
 * This page never creates a CardEvent and is not connected to any
 * investigation — this file imports nothing from the CardEvent ledger, the
 * counting engine, or `InvestigationContext`. It DOES call EyeOnPit's real,
 * unmodified, read-only `classifyVoiceTranscript` on each raw transcript
 * purely to DISPLAY what the existing safety pipeline would decide
 * (accepted/rejected, would-a-CardEvent-be-produced) — that classification
 * result is shown to the operator and nothing else; it is never dispatched,
 * committed, or written anywhere. See docs/EYEONPIT_VOICE_ARCHITECTURE.md
 * §4 for the safety boundary this page stays on the near side of. This is
 * a deliberate, narrow scope change from this page's first version (which
 * showed raw ASR only) — added 2026-08-20 specifically so ASR quality and
 * parser/safety-pipeline behavior can be told apart, per explicit
 * instruction.
 *
 * SEGMENTATION, 2026-08-19 ("SHERPA MIC HARNESS BUG" fix): every phrase is
 * its own clean recognition segment — START PHRASE begins a brand-new
 * provider session, END PHRASE stops it and deterministically flushes
 * whatever was decoded, and no decoder/session state carries into the next
 * phrase. See sherpaOnnxProvider.ts's own doc comment for why repeated
 * start/stop cycles are cheap (the WASM/model load is cached at module
 * scope, only the recognizer+stream reset per phrase).
 *
 * A/B/C DEALER COMPARISON, 2026-08-20: three selectable Sherpa
 * configurations, same phrases/mic conditions, so real accuracy can be
 * compared instead of guessed at:
 *   A — hotwords OFF entirely.
 *   B — CURRENT shipped configuration (hotwords ON, but with the exact
 *       `modelingUnit`/casing every prior round actually shipped —
 *       CONFIRMED WRONG for this model, kept as "B" deliberately so the
 *       comparison measures the real regression, not a strawman).
 *   C — TUNED configuration from the 2026-08-20 investigation: real
 *       `bpe.vocab` (generated from this exact model's own training
 *       `bpe.model`, not guessed), `modelingUnit: "bpe"`, hotword text
 *       UPPERCASED to match this model's training data. Construction and
 *       non-regression were verified in a real Chrome tab; real-mic
 *       accuracy has NOT — that's what this tooling is for. See
 *       `SHERPA_DEALER_HOTWORD_INVESTIGATION` in `sherpaOnnxProvider.ts`
 *       for the full, cited root-cause detail.
 *
 * Reachable only behind the existing /lab passcode gate. See
 * SherpaOnnxProvider's own ASSET DEPLOYMENT doc comment for what Sherpa
 * needs before it can do anything here: the WASM/model bundle AND the
 * generated `bpe.vocab`, reachable at `ASSET_BASE_URL` below — locally,
 * the gitignored `public/sherpa-onnx-lab/` path (never committed); in any
 * other environment, wherever `NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` points.
 * 2026-08-20: a real production deployment with that env var unset (so
 * `ASSET_BASE_URL` fell back to the local-only path, which doesn't exist
 * on Vercel) produced `onError("assets-not-found: ...")` on every attempt
 * — expected, correct, fail-closed behavior given no assets were ever
 * provisioned for that deployment, not a bug in this page or the
 * provider.
 */

/** The exact Dealer stress phrases from the 2026-08-20 investigation brief — run each under all three configurations. */
const DEALER_STRESS_PHRASES = [
  "Dealer",
  "Dealer has a five",
  "Dealer has a king",
  "Dealer showing ten",
  "Dealer has an ace",
  "Dealer has a king and a five",
] as const;

/** Representative Player/Spot phrases — so a Dealer-focused config change can't hide a regression elsewhere. */
const PLAYER_PHRASES = [
  "Player one has a five and a three.",
  "Player three hits, gets a four.",
  "Player three hits a four.",
  "Player sat down at player three.",
  "Current player is player one.",
  "Has a five and a three.",
  "Player five has a king.",
  "Player seven has an ace.",
  "Next hand.",
  "Split.",
  "Double.",
  "Insurance.",
  "Seven.",
] as const;

/** Ordinary sentences that are NOT blackjack commands — checks whether hotword biasing hallucinates casino vocabulary on unrelated speech. */
const NOISE_PHRASES = [
  "Spotify is dead.",
  "Play Drake music.",
  "It's 3:55.",
  "I have one eighth left.",
  "Taylor has a king and a five.",
  "What time does the buffet close.",
  "Can you send security to table twelve.",
  "I'll have a large coffee, no sugar.",
  "Sorry, hold on one second.",
  "My phone is at eight percent.",
] as const;

const ALL_PHRASES = [...DEALER_STRESS_PHRASES, ...PLAYER_PHRASES, ...NOISE_PHRASES];

type ProviderChoice = "sherpa-onnx" | "browser-web-speech";
/** Provider-connection-level status — separate from PhraseState, which tracks the CURRENT phrase's own start/end cycle. */
type ProviderStatus = "idle" | "loading" | "listening" | "error" | "stopped";
type PhraseState = "idle" | "listening" | "done" | "skipped";
type Correctness = "unmarked" | "correct" | "incorrect";

// Derived from the SAME resolution logic sherpaOnnxProvider.ts's own
// assetBaseUrl default uses (2026-08-20 "assets-not-found" production
// incident fix) — so this page and the provider can never drift onto two
// different asset hosts. Overridable in any environment via
// NEXT_PUBLIC_SHERPA_ASSET_BASE_URL; falls back to the gitignored local
// dev path, unchanged from every prior round.
// Trailing-slash-normalized the same way createSherpaOnnxProvider's own
// assetBaseUrl handling does internally, so an env var set without one
// (e.g. "https://blob.example/sherpa") still resolves correctly here.
// `process.env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` must appear as this exact
// literal expression — see sherpaOnnxProvider.ts's own DEFAULT_ASSET_BASE_URL
// comment for why passing the whole `process.env` object silently breaks
// Next.js's build-time inlining (confirmed the hard way this round: local
// verification kept hitting `/sherpa-onnx-lab/` instead of the configured
// Blob URL until this was fixed).
const ASSET_BASE_URL = resolveDefaultAssetBaseUrl({
  NEXT_PUBLIC_SHERPA_ASSET_BASE_URL: process.env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL,
}).replace(/\/?$/, "/");
const BPE_VOCAB_URL = `${ASSET_BASE_URL}bpe.vocab`;

interface InterimSnapshot {
  atMs: number;
  text: string;
}

interface ClassificationSummary {
  accepted: boolean;
  wouldProduceCardEvent: boolean;
  summary: string;
  rejectReason: string | null;
}

interface UtteranceRecord {
  index: number;
  recordedAt: string;
  provider: ProviderChoice;
  abConfig: AbConfig | null;
  expectedPhrase: string | null;
  interims: InterimSnapshot[];
  finalText: string | null;
  confidence: number | null;
  firstInterimMs: number | null;
  finalMs: number | null;
  error: string | null;
  skipped: boolean;
  classification: ClassificationSummary | null;
  correctness: Correctness;
}

/** Read-only — classifies a raw transcript through EyeOnPit's real, unmodified pipeline purely for display. Never dispatches, never writes a CardEvent. actionKey's "C:" prefix marks a card step, exactly as classifyVoiceTranscript.ts's own canonicalization doc comment describes. */
function classifyForDisplay(rawTranscript: string): ClassificationSummary {
  const result = classifyVoiceTranscript(rawTranscript, true, true);
  if (!result.valid) {
    return { accepted: false, wouldProduceCardEvent: false, summary: result.code, rejectReason: result.reason };
  }
  const wouldProduceCardEvent = result.actionKey.split("|").some((step) => step.startsWith("C:"));
  return { accepted: true, wouldProduceCardEvent, summary: result.summary, rejectReason: null };
}

export default function SherpaVoiceTestPage() {
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("sherpa-onnx");
  // 2026-08-20: C (tuned BPE + uppercase) is now the preferred Lab research
  // default — see DEFAULT_AB_CONFIG's own doc comment for why (the real
  // A/B/C mic session). A and B remain fully selectable for comparison.
  const [abConfig, setAbConfig] = useState<AbConfig>(DEFAULT_AB_CONFIG);
  const [status, setStatus] = useState<ProviderStatus>("idle");
  const [phraseState, setPhraseState] = useState<PhraseState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [liveInterim, setLiveInterim] = useState("");
  const [liveFinal, setLiveFinal] = useState("");
  const [records, setRecords] = useState<UtteranceRecord[]>([]);
  const [lastCompletedRecord, setLastCompletedRecord] = useState<UtteranceRecord | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [modelLoadMs, setModelLoadMs] = useState<number | null>(null);
  const [memoryMb, setMemoryMb] = useState<number | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  const providerRef = useRef<SpeechProvider | null>(null);
  const startClickedAtRef = useRef<number | null>(null);
  const utteranceT0Ref = useRef<number | null>(null);
  const pendingRecordRef = useRef<UtteranceRecord | null>(null);
  const recordIndexRef = useRef(0);
  const phraseIndexRef = useRef(phraseIndex);
  const providerChoiceRef = useRef(providerChoice);
  const abConfigRef = useRef(abConfig);

  const hotwordList = useMemo(() => buildHotwordList({ terminology: "spot" }), []);

  useEffect(() => {
    phraseIndexRef.current = phraseIndex;
  }, [phraseIndex]);
  useEffect(() => {
    providerChoiceRef.current = providerChoice;
  }, [providerChoice]);
  useEffect(() => {
    abConfigRef.current = abConfig;
  }, [abConfig]);

  // Reset the per-phrase cycle whenever the operator moves to a different
  // script line — adjusted during render (React's own recommended pattern
  // for "reset state when a value changes") rather than in an effect.
  const [phraseStateResetFor, setPhraseStateResetFor] = useState(phraseIndex);
  if (phraseStateResetFor !== phraseIndex) {
    setPhraseStateResetFor(phraseIndex);
    setPhraseState("idle");
    setLiveInterim("");
    setLiveFinal("");
  }

  // LAB UX FIX, 2026-08-20 (real A/B/C mic session finding): switching
  // provider/configuration used to leave `phraseIndex` wherever the
  // PREVIOUS run had reached, silently starting the newly-selected
  // configuration's captured records mid-corpus unless the operator
  // remembered to also click "Restart list from phrase 1" — otherwise the
  // only fix was a full page reload. This is a real, confirmed contributor
  // to the unequal per-configuration completed-record totals in the real
  // session (A=26, B=27, C=25 — see
  // docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md §11). Same render-time-reset
  // pattern as `phraseStateResetFor` above. `records` (the actual captured
  // cross-configuration comparison data) is deliberately NEVER cleared
  // here — only this run's transient phrase/session state resets, and no
  // page reload is ever required.
  const configKey = `${providerChoice}:${abConfig}`;
  const [configResetFor, setConfigResetFor] = useState(configKey);
  if (configResetFor !== configKey) {
    setConfigResetFor(configKey);
    setPhraseIndex(0);
    setModelLoadMs(null);
    setLastError(null);
    setStatus("idle");
    setLastCompletedRecord(null);
  }

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (status !== "listening") return;
    const id = window.setInterval(() => {
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
      if (perf.memory) setMemoryMb(Math.round((perf.memory.usedJSHeapSize / 1048576) * 10) / 10);
    }, 2000);
    return () => window.clearInterval(id);
  }, [status]);

  function newPendingRecord(): UtteranceRecord {
    const rec: UtteranceRecord = {
      index: recordIndexRef.current++,
      recordedAt: new Date().toISOString(),
      provider: providerChoiceRef.current,
      abConfig: providerChoiceRef.current === "sherpa-onnx" ? abConfigRef.current : null,
      expectedPhrase: phraseIndexRef.current >= 0 && phraseIndexRef.current < ALL_PHRASES.length ? ALL_PHRASES[phraseIndexRef.current] : null,
      interims: [],
      finalText: null,
      confidence: null,
      firstInterimMs: null,
      finalMs: null,
      error: null,
      skipped: false,
      classification: null,
      correctness: "unmarked",
    };
    pendingRecordRef.current = rec;
    return rec;
  }

  const handleInterim = useCallback((result: SpeechProviderResult) => {
    const now = performance.now();
    if (utteranceT0Ref.current === null) utteranceT0Ref.current = now;
    if (!pendingRecordRef.current) newPendingRecord();
    const rec = pendingRecordRef.current!;
    if (rec.firstInterimMs === null) rec.firstInterimMs = Math.round(now - utteranceT0Ref.current);
    rec.interims.push({ atMs: Math.round(now - utteranceT0Ref.current), text: result.transcript });
    setLiveInterim(result.transcript);
     
  }, []);

  const handleFinal = useCallback((result: SpeechProviderResult) => {
    const now = performance.now();
    if (utteranceT0Ref.current === null) utteranceT0Ref.current = now;
    if (!pendingRecordRef.current) newPendingRecord();
    const rec = pendingRecordRef.current!;
    rec.finalText = result.transcript;
    rec.confidence = result.confidence;
    rec.finalMs = Math.round(now - utteranceT0Ref.current);
    rec.classification = classifyForDisplay(result.transcript);
    setLiveFinal(result.transcript);
    setLastCompletedRecord(rec);
    setRecords((prev) => [...prev, rec]);
    pendingRecordRef.current = null;
    utteranceT0Ref.current = null;
     
  }, []);

  const handleError = useCallback((error: string) => {
    setLastError(error);
    setStatus("error");
    if (pendingRecordRef.current) {
      pendingRecordRef.current.error = error;
      setLastCompletedRecord(pendingRecordRef.current);
      setRecords((prev) => [...prev, pendingRecordRef.current!]);
      pendingRecordRef.current = null;
    } else {
      const rec = newPendingRecord();
      rec.error = error;
      setLastCompletedRecord(rec);
      setRecords((prev) => [...prev, rec]);
      pendingRecordRef.current = null;
    }
    utteranceT0Ref.current = null;
  }, []);

  /** Always builds a brand-new provider instance — never reuses one across phrases, so no provider-level state can carry over either. Cheap for Sherpa: the expensive WASM/model load is cached at module scope, only the recognizer+stream are actually new (see sherpaOnnxProvider.ts). Configuration A/B/C selects real, different sherpa options — see this page's own top-of-file doc comment. */
  const buildProvider = useCallback((): SpeechProvider => {
    const commonOptions = {
      onInterimResult: handleInterim,
      onFinalResult: handleFinal,
      onError: handleError,
      onAudioStart: () => {
        if (startClickedAtRef.current !== null) {
          setModelLoadMs(Math.round(performance.now() - startClickedAtRef.current));
        }
        setStatus("listening");
      },
      onSpeechStart: () => {
        utteranceT0Ref.current = performance.now();
      },
    };
    if (providerChoice !== "sherpa-onnx") {
      return createBrowserWebSpeechProvider(commonOptions);
    }
    return createSherpaOnnxProvider({
      ...commonOptions,
      assetBaseUrl: ASSET_BASE_URL,
      ...resolveAbConfigProviderOptions(abConfig, hotwordList, BPE_VOCAB_URL),
    });
  }, [providerChoice, abConfig, hotwordList, handleInterim, handleFinal, handleError]);

  const startPhrase = useCallback(() => {
    if (phraseState === "listening") return;
    setLastError(null);
    setStatus("loading");
    setPhraseState("listening");
    setLiveInterim("");
    setLiveFinal("");
    startClickedAtRef.current = performance.now();
    utteranceT0Ref.current = null;
    pendingRecordRef.current = null;

    const provider = buildProvider();
    providerRef.current = provider;
    if (!provider.supported) {
      setStatus("error");
      setPhraseState("idle");
      setLastError("unsupported-in-this-browser");
      return;
    }
    provider.start();
  }, [phraseState, buildProvider]);

  const endPhrase = useCallback(() => {
    if (phraseState !== "listening") return;
    providerRef.current?.stop();
    providerRef.current = null;
    setStatus("stopped");
    setPhraseState("done");
  }, [phraseState]);

  const skipPhrase = useCallback(() => {
    if (phraseState === "listening") {
      providerRef.current?.stop();
      providerRef.current = null;
      setStatus("stopped");
    }
    setPhraseState("skipped");
  }, [phraseState]);

  const nextPhrase = useCallback(() => {
    if (phraseState !== "done" && phraseState !== "skipped") return;
    setPhraseIndex((i) => Math.min(ALL_PHRASES.length - 1, i + 1));
  }, [phraseState]);

  const restartPhraseList = useCallback(() => {
    setPhraseIndex(0);
  }, []);

  function markCorrectness(index: number, correctness: Correctness) {
    setRecords((prev) => prev.map((r) => (r.index === index ? { ...r, correctness } : r)));
  }

  // Grouping/rate logic lives in sherpaAbTestHarness.ts, pure and unit-tested
  // there (see computeAggregatesByConfig's own doc comment on why totals are
  // never padded/normalized to a common N).
  const aggregatesByConfig = useMemo(() => computeAggregatesByConfig(records), [records]);

  const exportJson = useMemo(
    () =>
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          provider: providerChoice,
          abConfig,
          hotwordCount: hotwordList.length,
          modelLoadMs,
          aggregatesByConfig,
          records,
        },
        null,
        2
      ),
    [providerChoice, abConfig, hotwordList.length, modelLoadMs, aggregatesByConfig, records]
  );

  function downloadJson() {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sherpa-dealer-ab-test-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // LAB UX ADDITION, 2026-08-20: Copy JSON previously gave no confirmation
  // it worked at all — an operator had no way to tell a click succeeded
  // short of pasting somewhere and checking. `copyStatus` drives both the
  // button's own temporary label and an `aria-live` announcement; reverts
  // to "idle" automatically after 2s so it never gets stuck.
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copyJson() {
    if (copyStatusTimeoutRef.current) window.clearTimeout(copyStatusTimeoutRef.current);
    if (!navigator.clipboard) {
      setCopyStatus("failed");
      copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus("idle"), 2500);
      return;
    }
    navigator.clipboard
      .writeText(exportJson)
      .then(() => {
        setCopyStatus("copied");
        copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus("idle"), 2000);
      })
      .catch(() => {
        setCopyStatus("failed");
        copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus("idle"), 2500);
      });
  }

  useEffect(() => {
    return () => {
      if (copyStatusTimeoutRef.current) window.clearTimeout(copyStatusTimeoutRef.current);
    };
  }, []);

  const currentPhrase = phraseIndex >= 0 && phraseIndex < ALL_PHRASES.length ? ALL_PHRASES[phraseIndex] : null;
  const isDealerStress = phraseIndex < DEALER_STRESS_PHRASES.length;
  const isNoisePhrase = phraseIndex >= DEALER_STRESS_PHRASES.length + PLAYER_PHRASES.length;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">Sherpa Dealer A/B/C Field Test</h1>
      </div>
      <p className="rounded-md border border-pending/40 bg-pending/10 p-2 text-xs font-medium text-pending">
        LAB DIAGNOSTIC. This page never creates a CardEvent and is not connected to any investigation. It shows raw
        ASR output AND EyeOnPit&apos;s real, unmodified, read-only classification of that text — display only, never
        dispatched or committed anywhere.
      </p>

      {/* Provider + configuration selection */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">1. Select provider and configuration</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setProviderChoice("sherpa-onnx")}
            disabled={phraseState === "listening"}
            className={`tap-target rounded-lg border px-3 text-sm font-semibold ${
              providerChoice === "sherpa-onnx" ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground"
            } disabled:opacity-60`}
          >
            Sherpa-ONNX (Experimental)
          </button>
          <button
            type="button"
            onClick={() => setProviderChoice("browser-web-speech")}
            disabled={phraseState === "listening"}
            className={`tap-target rounded-lg border px-3 text-sm font-semibold ${
              providerChoice === "browser-web-speech" ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground"
            } disabled:opacity-60`}
          >
            Chrome Web Speech (baseline)
          </button>
        </div>

        {providerChoice === "sherpa-onnx" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["A", "B", "C"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAbConfig(c)}
                disabled={phraseState === "listening"}
                className={`tap-target rounded-lg border px-3 text-sm font-semibold ${
                  abConfig === c ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground"
                } disabled:opacity-60`}
              >
                {c === "A" && "A — Hotwords OFF"}
                {c === "B" && "B — Current (shipped)"}
                {c === "C" && "C — Tuned (bpe + uppercase) — preferred"}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {providerChoice !== "sherpa-onnx"
            ? "Chrome baseline — A/B/C only applies to Sherpa."
            : abConfig === "A"
              ? "No hotwords file at all."
              : abConfig === "B"
                ? 'Hotwords ON, modelingUnit="cjkchar" (default) — the exact configuration every prior round shipped. CONFIRMED wrong for this model.'
                : 'Hotwords ON, modelingUnit="bpe" + real bpe.vocab + UPPERCASE phrase text — the 2026-08-20 investigation\'s corrected configuration.'}
        </p>
      </section>

      {/* Script + per-phrase controls */}
      <section className="rounded-xl border border-border bg-surface p-3">
        {/* LAB UX FIX, 2026-08-20: makes the ACTIVE recording configuration
            unmistakable at the point results are actually captured, not
            just in section 1's button row above (which scrolls out of view
            once phrases are underway) — the real A/B/C session flagged
            this as a real risk of misattributing a captured run to the
            wrong configuration. */}
        <p
          data-testid="active-config-banner"
          className="mb-2 inline-block rounded-full border border-accent bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent"
        >
          Recording under: {providerChoice === "sherpa-onnx" ? `Sherpa-ONNX — Config ${abConfig}` : "Chrome Web Speech (baseline)"}
        </p>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">
            2. Phrase {phraseIndex + 1} of {ALL_PHRASES.length}
          </h2>
          <button type="button" onClick={restartPhraseList} className="text-xs font-semibold text-accent hover:underline">
            Restart list from phrase 1
          </button>
        </div>
        <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-base font-semibold text-foreground">
          EXPECTED: {currentPhrase}
          {isDealerStress && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">DEALER STRESS</span>}
          {isNoisePhrase && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">NOISE / NOT A COMMAND</span>}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startPhrase}
            disabled={phraseState === "listening"}
            className="tap-target flex items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            <Mic className="h-4 w-4" aria-hidden /> {status === "loading" ? "Loading…" : "Start Phrase"}
          </button>
          <button
            type="button"
            onClick={endPhrase}
            disabled={phraseState !== "listening"}
            className="tap-target flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            <Square className="h-4 w-4" aria-hidden /> End Phrase
          </button>
          <button
            type="button"
            onClick={skipPhrase}
            disabled={phraseState === "done" || phraseState === "skipped"}
            className="tap-target flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            <SkipForward className="h-4 w-4" aria-hidden /> Skip
          </button>
          <button
            type="button"
            onClick={nextPhrase}
            disabled={phraseState !== "done" && phraseState !== "skipped"}
            className="tap-target flex items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            Next Phrase <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Phrase state: {phraseState}</p>

        <ol className="mt-3 max-h-48 overflow-y-auto text-xs text-muted-foreground">
          {ALL_PHRASES.map((p, i) => (
            <li key={i} className={i === phraseIndex ? "font-semibold text-foreground" : ""}>
              {i + 1}. {p}
            </li>
          ))}
        </ol>
      </section>

      {/* Provider status */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">Provider status</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="text-foreground">{providerChoice}{providerChoice === "sherpa-onnx" ? ` — config ${abConfig}` : ""}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className={status === "error" ? "font-semibold text-destructive" : status === "listening" ? "font-semibold text-status-green" : "text-foreground"}>
            {status}
          </dd>
          <dt className="text-muted-foreground">Last error</dt>
          <dd className="text-destructive">{lastError ?? "—"}</dd>
          <dt className="text-muted-foreground">Model/session load time</dt>
          <dd className="text-foreground">{modelLoadMs !== null ? `${modelLoadMs} ms` : "—"}</dd>
          <dt className="text-muted-foreground">Approx. JS heap (Chrome-only)</dt>
          <dd className="text-foreground">{memoryMb !== null ? `${memoryMb} MB` : "—"}</dd>
          <dt className="text-muted-foreground">Network</dt>
          <dd className="text-foreground">{online ? "online" : "OFFLINE"}</dd>
        </dl>
      </section>

      {/* Live transcript + classification */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">Raw transcript + classification (display only, never dispatched)</h2>
        <div className="mb-2">
          <div className="text-xs font-semibold text-muted-foreground">INTERIM (live)</div>
          <p className="min-h-6 rounded-md bg-surface-raised p-2 text-sm text-muted-foreground">{liveInterim || "—"}</p>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground">RAW FINAL</div>
          <p className="min-h-6 rounded-md bg-surface-raised p-2 text-sm font-semibold text-foreground">{liveFinal || "—"}</p>
        </div>
        {lastCompletedRecord && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">First interim</dt>
            <dd className="text-foreground">{lastCompletedRecord.firstInterimMs !== null ? `${lastCompletedRecord.firstInterimMs} ms` : "—"}</dd>
            <dt className="text-muted-foreground">Final latency</dt>
            <dd className="text-foreground">{lastCompletedRecord.finalMs !== null ? `${lastCompletedRecord.finalMs} ms` : "—"}</dd>
            <dt className="text-muted-foreground">Accepted by classifier</dt>
            <dd className={lastCompletedRecord.classification?.accepted ? "font-semibold text-status-green" : "text-foreground"}>
              {lastCompletedRecord.classification ? (lastCompletedRecord.classification.accepted ? "ACCEPTED" : "REJECTED") : "—"}
            </dd>
            <dt className="text-muted-foreground">Would produce a CardEvent</dt>
            <dd className={lastCompletedRecord.classification?.wouldProduceCardEvent ? "font-semibold text-status-orange" : "text-foreground"}>
              {lastCompletedRecord.classification ? (lastCompletedRecord.classification.wouldProduceCardEvent ? "YES" : "no") : "—"}
            </dd>
            <dt className="text-muted-foreground">Classifier summary</dt>
            <dd className="text-foreground">{lastCompletedRecord.classification?.summary ?? "—"}</dd>
          </div>
        )}
      </section>

      {/* Aggregate accuracy per configuration */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">3. Aggregate accuracy by configuration</h2>
        {aggregatesByConfig.some((a) => a.total !== aggregatesByConfig[0]?.total) && (
          <p className="mb-2 rounded-md border border-pending/40 bg-pending/10 p-2 text-[11px] font-medium text-pending">
            Unequal phrase counts per configuration — these rates are descriptive of what was actually captured in
            each run, not a controlled equal-N accuracy comparison. See docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md §11.
          </p>
        )}
        {aggregatesByConfig.length === 0 ? (
          <p className="text-xs text-muted-foreground">No phrases recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-3">Configuration</th>
                  <th className="pr-3">Phrases</th>
                  <th className="pr-3">Accepted rate</th>
                  <th className="pr-3">Would produce CardEvent rate</th>
                  <th className="pr-3">Marked correct (of marked)</th>
                </tr>
              </thead>
              <tbody>
                {aggregatesByConfig.map((a) => (
                  <tr key={a.key} className="border-t border-border">
                    <td className="pr-3 font-semibold text-foreground">{a.key}</td>
                    <td className="pr-3 text-foreground">{a.total}</td>
                    <td className="pr-3 text-foreground">{(a.acceptedRate * 100).toFixed(0)}%</td>
                    <td className="pr-3 text-foreground">{(a.cardEventRate * 100).toFixed(0)}%</td>
                    <td className="pr-3 text-foreground">{a.correctRate !== null ? `${(a.correctRate * 100).toFixed(0)}% (${a.marked})` : `— (0)`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Results log */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">4. Captured results ({records.length})</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyJson}
              className={`tap-target flex items-center gap-1 rounded-lg border px-2 text-xs font-semibold ${
                copyStatus === "copied"
                  ? "border-status-green bg-status-green/10 text-status-green"
                  : copyStatus === "failed"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border text-foreground"
              }`}
            >
              {copyStatus === "copied" ? (
                <>
                  <Check className="h-3 w-3" aria-hidden /> JSON Copied
                </>
              ) : copyStatus === "failed" ? (
                <>
                  <X className="h-3 w-3" aria-hidden /> Copy failed
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden /> Copy JSON
                </>
              )}
            </button>
            {/* Accessible confirmation channel, separate from the button's
                own visual label — screen readers announce this without the
                operator needing to notice the button text changed. */}
            <span role="status" aria-live="polite" className="sr-only">
              {copyStatus === "copied" ? "JSON copied to clipboard" : copyStatus === "failed" ? "Copy to clipboard failed" : ""}
            </span>
            <button type="button" onClick={downloadJson} className="tap-target flex items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold text-foreground">
              <Download className="h-3 w-3" aria-hidden /> Download JSON
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pr-2">#</th>
                <th className="pr-2">Config</th>
                <th className="pr-2">Expected</th>
                <th className="pr-2">Raw final</th>
                <th className="pr-2">Classified</th>
                <th className="pr-2">Accepted</th>
                <th className="pr-2">CardEvent?</th>
                <th className="pr-2">Latency</th>
                <th className="pr-2">Correct?</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.index} className="border-t border-border">
                  <td className="pr-2 text-foreground">{r.index + 1}</td>
                  <td className="pr-2 text-muted-foreground">{r.provider === "sherpa-onnx" ? r.abConfig : "chrome"}</td>
                  <td className="pr-2 text-muted-foreground">{r.expectedPhrase ?? "—"}</td>
                  <td className="pr-2 font-medium text-foreground">{r.finalText ?? "—"}</td>
                  <td className="pr-2 text-foreground">{r.classification?.summary ?? "—"}</td>
                  <td className={r.classification?.accepted ? "pr-2 font-semibold text-status-green" : "pr-2 text-foreground"}>
                    {r.classification ? (r.classification.accepted ? "yes" : "no") : "—"}
                  </td>
                  <td className={r.classification?.wouldProduceCardEvent ? "pr-2 font-semibold text-status-orange" : "pr-2 text-foreground"}>
                    {r.classification ? (r.classification.wouldProduceCardEvent ? "YES" : "no") : "—"}
                  </td>
                  <td className="pr-2 text-foreground">{r.finalMs !== null ? `${r.finalMs}ms` : "—"}</td>
                  <td className="pr-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => markCorrectness(r.index, "correct")}
                        aria-label="Mark correct"
                        className={`rounded p-0.5 ${r.correctness === "correct" ? "bg-status-green text-white" : "border border-border text-muted-foreground"}`}
                      >
                        <Check className="h-3 w-3" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => markCorrectness(r.index, "incorrect")}
                        aria-label="Mark incorrect"
                        className={`rounded p-0.5 ${r.correctness === "incorrect" ? "bg-destructive text-white" : "border border-border text-muted-foreground"}`}
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <textarea readOnly value={exportJson} className="mt-3 h-40 w-full rounded-md border border-border bg-surface-raised p-2 font-mono text-[10px] text-foreground" />
      </section>
    </div>
  );
}
