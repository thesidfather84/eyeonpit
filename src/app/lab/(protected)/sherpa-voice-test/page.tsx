"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Mic, Square, SkipForward, ArrowRight, Download, Copy } from "lucide-react";
import { createSherpaOnnxProvider } from "@/lib/voice/sherpaOnnxProvider";
import { createBrowserWebSpeechProvider } from "@/lib/voice/browserWebSpeechProvider";
import { buildHotwordList } from "@/lib/voice/casinoVoiceContext";
import type { SpeechProvider, SpeechProviderResult } from "@/lib/voice/speechProvider";

/**
 * SHERPA REAL MIC FIELD TEST — ASR EVALUATION ONLY.
 *
 * This page exists to answer exactly one question: does sherpa-onnx
 * recognize a real operator's real speech better than Chrome's built-in
 * Web Speech engine. It is NOT a preview of a future feature and it NEVER
 * writes a CardEvent — this file imports nothing from the CardEvent
 * ledger, the counting engine, narration parsing, or normalization. Every
 * transcript shown here is the provider's own raw output, unmodified.
 * Nothing recognized on this page is safety-validated, narration-parsed,
 * or committed anywhere — see docs/EYEONPIT_VOICE_ARCHITECTURE.md §4 for
 * the safety boundary this page deliberately stays on the near side of.
 *
 * SEGMENTATION, 2026-08-19 ("SHERPA MIC HARNESS BUG" fix): the first real
 * mic session used a single continuous provider session for the whole
 * script, relying on automatic silence/endpoint detection to split it into
 * per-phrase results — that detection did not fire reliably in a real
 * session, producing 2 runaway transcripts each containing many
 * concatenated phrases instead of one final per utterance. This page now
 * drives segmentation explicitly: START PHRASE begins a brand-new provider
 * session (a fresh recognizer/stream for Sherpa, a fresh native
 * SpeechRecognition instance for Chrome — see sherpaOnnxProvider.ts's own
 * doc comment on why this is now cheap), END PHRASE stops it and
 * deterministically flushes whatever was decoded so far, and no
 * decoder/session state is ever carried into the next phrase. NEXT PHRASE
 * is disabled until the current one is finalized or explicitly skipped.
 *
 * Reachable only behind the existing /lab passcode gate
 * (src/app/lab/(protected)/layout.tsx) — the same separation every other
 * EXPERIMENTAL tool in this Lab already uses to stay out of normal
 * operators' hands. See the SherpaOnnxProvider's own ASSET DEPLOYMENT doc
 * comment for the one manual step required before Sherpa will do anything
 * here: the ~205MB WASM/model bundle must be extracted into
 * `public/sherpa-onnx-lab/` locally (gitignored, never committed).
 */

const SCRIPT_PHRASES = [
  "Dealer has a five.",
  "Dealer has a king and a five.",
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
  "Spotify is dead.",
  "Play Drake music.",
  "It's 3:55.",
  "I have one eighth left.",
  "Taylor has a king and a five.",
] as const;

/** Ordinary sentences that are NOT blackjack commands — included per explicit instruction, to check whether hotword biasing causes hallucinated casino vocabulary on speech that has nothing to do with it. */
const NOISE_PHRASES = [
  "What time does the buffet close.",
  "Can you send security to table twelve.",
  "I'll have a large coffee, no sugar.",
  "Sorry, hold on one second.",
  "My phone is at eight percent.",
] as const;

/** Repeated bare/short "Dealer" probes, per the real finding that "Dealer" was misheard as "KILLER"/"TILLER" — run these last, with hotwords toggled both ways, before touching any recognition logic for it. */
const DEALER_PROBE_PHRASES = ["Dealer", "Dealer has a five", "Dealer has a king", "The dealer has a five", "Dealer showing ten"] as const;

const ALL_PHRASES = [...SCRIPT_PHRASES, ...NOISE_PHRASES, ...DEALER_PROBE_PHRASES];

type ProviderChoice = "sherpa-onnx" | "browser-web-speech";
/** Provider-connection-level status — separate from PhraseState, which tracks the CURRENT phrase's own start/end cycle. */
type ProviderStatus = "idle" | "loading" | "listening" | "error" | "stopped";
type PhraseState = "idle" | "listening" | "done" | "skipped";

interface InterimSnapshot {
  atMs: number;
  text: string;
}

interface UtteranceRecord {
  index: number;
  recordedAt: string;
  expectedPhrase: string | null;
  interims: InterimSnapshot[];
  finalText: string | null;
  confidence: number | null;
  firstInterimMs: number | null;
  finalMs: number | null;
  error: string | null;
  skipped: boolean;
}

export default function SherpaVoiceTestPage() {
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("sherpa-onnx");
  const [hotwordsEnabled, setHotwordsEnabled] = useState(true);
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

  const hotwordList = useMemo(() => buildHotwordList({ terminology: "spot" }), []);

  useEffect(() => {
    phraseIndexRef.current = phraseIndex;
  }, [phraseIndex]);

  // Reset the per-phrase cycle whenever the operator moves to a different
  // script line — never carries a live/finalized phrase's state forward.
  // Adjusted during render (React's own recommended pattern for "reset
  // state when a value changes") rather than in an effect, so there is no
  // extra render pass and no risk of an effect running with stale state.
  const [phraseStateResetFor, setPhraseStateResetFor] = useState(phraseIndex);
  if (phraseStateResetFor !== phraseIndex) {
    setPhraseStateResetFor(phraseIndex);
    setPhraseState("idle");
    setLiveInterim("");
    setLiveFinal("");
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
      expectedPhrase: phraseIndexRef.current >= 0 && phraseIndexRef.current < ALL_PHRASES.length ? ALL_PHRASES[phraseIndexRef.current] : null,
      interims: [],
      finalText: null,
      confidence: null,
      firstInterimMs: null,
      finalMs: null,
      error: null,
      skipped: false,
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

  /** Always builds a brand-new provider instance — never reuses one across phrases, so no provider-level state can carry over either. Cheap for Sherpa: the expensive WASM/model load is cached at module scope (see sherpaOnnxProvider.ts), only the recognizer+stream are actually new. */
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
    return providerChoice === "sherpa-onnx"
      ? createSherpaOnnxProvider({
          ...commonOptions,
          assetBaseUrl: "/sherpa-onnx-lab/",
          hotwords: hotwordsEnabled ? hotwordList : undefined,
        })
      : createBrowserWebSpeechProvider(commonOptions);
  }, [providerChoice, hotwordsEnabled, hotwordList, handleInterim, handleFinal, handleError]);

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

  const exportJson = useMemo(
    () =>
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          provider: providerChoice,
          hotwordsEnabled,
          hotwordCount: hotwordList.length,
          modelLoadMs,
          records,
        },
        null,
        2
      ),
    [providerChoice, hotwordsEnabled, hotwordList.length, modelLoadMs, records]
  );

  function downloadJson() {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sherpa-mic-test-${providerChoice}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyJson() {
    navigator.clipboard?.writeText(exportJson).catch(() => {});
  }

  const currentPhrase = phraseIndex >= 0 && phraseIndex < ALL_PHRASES.length ? ALL_PHRASES[phraseIndex] : null;
  const isNoisePhrase = phraseIndex >= SCRIPT_PHRASES.length && phraseIndex < SCRIPT_PHRASES.length + NOISE_PHRASES.length;
  const isDealerProbe = phraseIndex >= SCRIPT_PHRASES.length + NOISE_PHRASES.length;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">Sherpa Real Mic Field Test</h1>
      </div>
      <p className="rounded-md border border-pending/40 bg-pending/10 p-2 text-xs font-medium text-pending">
        ASR EVALUATION ONLY. This page never creates a CardEvent, never runs EyeOnPit normalization or narration
        parsing, and is not connected to any investigation. It shows exactly what the selected speech engine itself
        heard, raw. Each phrase is its own clean recognition segment — see this page&apos;s own SEGMENTATION doc
        comment.
      </p>

      {/* Provider selection */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">1. Select provider</h2>
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
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hotwordsEnabled}
            onChange={(e) => setHotwordsEnabled(e.target.checked)}
            disabled={providerChoice !== "sherpa-onnx" || phraseState === "listening"}
          />
          Enable EyeOnPit casino hotwords ({hotwordList.length} phrases, Sherpa only)
        </label>
      </section>

      {/* Script + per-phrase controls */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">
          2. Phrase {phraseIndex + 1} of {ALL_PHRASES.length}
        </h2>
        <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-base font-semibold text-foreground">
          EXPECTED: {currentPhrase}
          {isNoisePhrase && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">NOISE / NOT A COMMAND</span>}
          {isDealerProbe && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">DEALER PROBE</span>}
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
          <dd className="text-foreground">{providerChoice}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className={status === "error" ? "font-semibold text-destructive" : status === "listening" ? "font-semibold text-status-green" : "text-foreground"}>
            {status}
          </dd>
          <dt className="text-muted-foreground">Last error</dt>
          <dd className="text-destructive">{lastError ?? "—"}</dd>
          <dt className="text-muted-foreground">Hotword/context status</dt>
          <dd className="text-foreground">
            {providerChoice === "sherpa-onnx" ? (hotwordsEnabled ? `ENABLED — ${hotwordList.length} phrases` : "DISABLED") : "N/A (Chrome has no hotword API)"}
          </dd>
          <dt className="text-muted-foreground">Model/session load time</dt>
          <dd className="text-foreground">{modelLoadMs !== null ? `${modelLoadMs} ms` : "—"}</dd>
          <dt className="text-muted-foreground">Approx. JS heap (Chrome-only)</dt>
          <dd className="text-foreground">{memoryMb !== null ? `${memoryMb} MB` : "—"}</dd>
          <dt className="text-muted-foreground">Network</dt>
          <dd className="text-foreground">{online ? "online" : "OFFLINE"}</dd>
        </dl>
      </section>

      {/* Live transcript */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold text-foreground">Raw transcript (unmodified, pre-normalization)</h2>
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
          </div>
        )}
      </section>

      {/* Results log */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">3. Captured results ({records.length})</h2>
          <div className="flex gap-2">
            <button type="button" onClick={copyJson} className="tap-target flex items-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold text-foreground">
              <Copy className="h-3 w-3" aria-hidden /> Copy JSON
            </button>
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
                <th className="pr-2">Expected</th>
                <th className="pr-2">Final (raw)</th>
                <th className="pr-2">1st interim</th>
                <th className="pr-2">Final latency</th>
                <th className="pr-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.index} className="border-t border-border">
                  <td className="pr-2 text-foreground">{r.index + 1}</td>
                  <td className="pr-2 text-muted-foreground">{r.expectedPhrase ?? "—"}</td>
                  <td className="pr-2 font-medium text-foreground">{r.finalText ?? "—"}</td>
                  <td className="pr-2 text-foreground">{r.firstInterimMs !== null ? `${r.firstInterimMs}ms` : "—"}</td>
                  <td className="pr-2 text-foreground">{r.finalMs !== null ? `${r.finalMs}ms` : "—"}</td>
                  <td className="pr-2 text-destructive">{r.error ?? "—"}</td>
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
