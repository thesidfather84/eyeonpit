"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlaskConical, Mic, Square, SkipForward, RotateCcw, Download } from "lucide-react";
import {
  createVoskProvider,
  VOSK_EXPANDED_GRAMMAR_PHRASES,
  VOSK_PROTOTYPE_GRAMMAR_PHRASES,
  VOSK_PROVENANCE,
  type VoskPhraseDiagnostics,
} from "@/lib/voice/voskProvider";
import { createBrowserWebSpeechProvider } from "@/lib/voice/browserWebSpeechProvider";
import {
  evaluateNativeVoiceTranscript,
  NATIVE_VOICE_EXPANDED_GROUPS,
  NATIVE_VOICE_NOISE_PHRASES,
  NATIVE_VOICE_PROTOTYPE_PHRASES,
  type NativeVoiceResult,
} from "@/lib/voice/nativeVoicePrototype";
import { isFalseCardEvent } from "@/lib/voice/nativeVoiceCorpus";
import type { SpeechProvider, SpeechProviderResult } from "@/lib/voice/speechProvider";

/**
 * NATIVE VOICE PROTOTYPE — LAB ONLY, CLEARLY LABELED. See
 * docs/EYEONPIT_NATIVE_VOICE_SPEC.md and the milestone briefs this page
 * implements (Prototype 0.1, then v0.2's "carefully controlled English
 * grammar built only from existing production vocabulary"). NOT production
 * voice, NOT multilingual, NOT a general speech recognizer.
 *
 * SAFETY: this page NEVER writes a CardEvent. It imports nothing from the
 * CardEvent ledger, the counting engine, or InvestigationContext — every
 * result shown here is read-only display, exactly like the Sherpa/Whisper
 * Lab pages. `wouldProduceCardEvent` tells the operator what WOULD happen
 * if this were wired into production, nothing more. `isFalseCardEvent`
 * (nativeVoiceCorpus.ts) is the REAL misrecognition check — it compares the
 * DISPLAYED phrase's known-correct command against whatever the provider
 * actually transcribed, so a wrong-but-valid-looking recognition (e.g.
 * hearing "nine" when "five" was said) is correctly caught, not just any
 * CardEvent on an unexpected phrase.
 *
 * Does NOT replace Browser Web Speech (production), Sherpa-ONNX, or
 * Whisper.cpp — Browser Web Speech is offered here only as a REFERENCE
 * comparison provider (same existing production code, reused read-only).
 *
 * TWO SIZES, per explicit instruction ("do not force Sidney through a huge
 * corpus"): Quick Smoke Test stays the original 7 phrases; Native Voice
 * Expanded English Test is the v0.2 grammar (NATIVE_VOICE_EXPANDED_GROUPS —
 * dealer/card, player/card, controls), a practical, bounded size built
 * ONLY from vocabulary already real in production. The Noise rejection set
 * tests whichever grammar is currently active (quick or expanded).
 */

type ProviderChoice = "vosk" | "browser-web-speech";
type PhraseState = "idle" | "listening" | "done" | "skipped";
type TestMode = "quick" | "expanded" | "noise";

interface PhraseRecord {
  index: number;
  phrase: string;
  group: string | null;
  provider: ProviderChoice;
  transcript: string | null;
  confidence: number | null;
  firstInterimMs: number | null;
  finalMs: number | null;
  error: string | null;
  skipped: boolean;
  result: NativeVoiceResult | null;
  voskDiagnostics: VoskPhraseDiagnostics | null;
}

interface PhraseEntry {
  phrase: string;
  group: string | null;
}

const QUICK_ENTRIES: PhraseEntry[] = NATIVE_VOICE_PROTOTYPE_PHRASES.map((phrase) => ({ phrase, group: null }));
const EXPANDED_ENTRIES: PhraseEntry[] = NATIVE_VOICE_EXPANDED_GROUPS.flatMap((g) => g.phrases.map((phrase) => ({ phrase, group: g.label })));
const NOISE_ENTRIES: PhraseEntry[] = NATIVE_VOICE_NOISE_PHRASES.map((phrase) => ({ phrase, group: "Ambiguity / Noise" }));

function verdictBadgeClass(verdict: NativeVoiceResult["verdict"] | null): string {
  if (verdict === "ACCEPT") return "bg-status-green/15 text-status-green";
  if (verdict === "REPEAT") return "bg-pending/15 text-pending";
  if (verdict === "REJECT") return "bg-muted/30 text-muted-foreground";
  return "bg-muted/30 text-muted-foreground";
}

export default function NativeVoiceTestPage() {
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("vosk");
  const [testMode, setTestMode] = useState<TestMode>("quick");
  const [grammarMode, setGrammarMode] = useState<"quick" | "expanded">("quick");
  const [activeEntries, setActiveEntries] = useState<PhraseEntry[]>(QUICK_ENTRIES);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phraseState, setPhraseState] = useState<PhraseState>("idle");
  const [providerStatus, setProviderStatus] = useState<"idle" | "loading" | "listening" | "error" | "stopped">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [records, setRecords] = useState<PhraseRecord[]>([]);

  const providerRef = useRef<SpeechProvider | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const firstInterimAtRef = useRef<number | null>(null);
  const lastResultRef = useRef<{ transcript: string; confidence: number | null } | null>(null);
  const lastDiagnosticsRef = useRef<VoskPhraseDiagnostics | null>(null);

  const currentEntry = activeEntries[currentIndex] ?? null;
  const currentPhrase = currentEntry?.phrase ?? null;

  const falseCardEventCount = useMemo(
    () => records.filter((r) => !r.skipped && r.result && isFalseCardEvent(r.phrase, r.result.commands)).length,
    [records]
  );

  const teardownProvider = useCallback(() => {
    providerRef.current?.stop();
    providerRef.current = null;
  }, []);

  const switchProvider = useCallback(
    (next: ProviderChoice) => {
      teardownProvider();
      setProviderChoice(next);
      setProviderStatus("idle");
      setPhraseState("idle");
      setLastError(null);
      // Provider switching must never bleed a previous provider's
      // in-flight phrase/result into the newly selected one — resetting
      // to Phrase 1, matching the existing Sherpa Lab's own config-switch
      // reset discipline (sherpaAbTestHarness.ts / page.test.tsx).
      setCurrentIndex(0);
    },
    [teardownProvider]
  );

  const finishPhrase = useCallback(
    (skipped: boolean) => {
      const entry = activeEntries[currentIndex];
      const finalMs = startedAtRef.current != null ? performance.now() - startedAtRef.current : null;
      const captured = lastResultRef.current;
      const record: PhraseRecord = {
        index: currentIndex,
        phrase: entry.phrase,
        group: entry.group,
        provider: providerChoice,
        transcript: skipped ? null : (captured?.transcript ?? null),
        confidence: skipped ? null : (captured?.confidence ?? null),
        firstInterimMs: firstInterimAtRef.current,
        finalMs: skipped ? null : finalMs,
        error: lastError,
        skipped,
        result: !skipped && captured ? evaluateNativeVoiceTranscript(captured.transcript) : null,
        voskDiagnostics: skipped ? null : lastDiagnosticsRef.current,
      };
      setRecords((prev) => [...prev, record]);
      setPhraseState(skipped ? "skipped" : "done");
      startedAtRef.current = null;
      firstInterimAtRef.current = null;
      lastResultRef.current = null;
      lastDiagnosticsRef.current = null;
    },
    [activeEntries, currentIndex, lastError, providerChoice]
  );

  const startPhrase = useCallback(() => {
    if (currentPhrase == null) return;
    setLastError(null);
    setPhraseState("listening");
    setProviderStatus("loading");
    startedAtRef.current = performance.now();
    firstInterimAtRef.current = null;
    lastResultRef.current = null;
    lastDiagnosticsRef.current = null;

    const onFinalResult = (r: SpeechProviderResult) => {
      lastResultRef.current = { transcript: r.transcript, confidence: r.confidence };
    };
    const onInterimResult = (r: SpeechProviderResult) => {
      if (firstInterimAtRef.current == null && startedAtRef.current != null) {
        firstInterimAtRef.current = performance.now() - startedAtRef.current;
      }
      lastResultRef.current = { transcript: r.transcript, confidence: r.confidence };
    };
    const onError = (message: string) => {
      setLastError(message);
      setProviderStatus("error");
    };

    const provider =
      providerChoice === "vosk"
        ? createVoskProvider({
            onFinalResult,
            onInterimResult,
            onError,
            onAudioStart: () => setProviderStatus("listening"),
            onAudioEnd: () => setProviderStatus("stopped"),
            grammarPhrases: grammarMode === "expanded" ? VOSK_EXPANDED_GRAMMAR_PHRASES : VOSK_PROTOTYPE_GRAMMAR_PHRASES,
            onPhraseDiagnostics: (d) => {
              lastDiagnosticsRef.current = d;
            },
          })
        : createBrowserWebSpeechProvider({
            onFinalResult,
            onInterimResult,
            onError,
            onAudioStart: () => setProviderStatus("listening"),
            onAudioEnd: () => setProviderStatus("stopped"),
          });
    providerRef.current = provider;
    provider.start();
  }, [currentPhrase, providerChoice, grammarMode]);

  const endPhrase = useCallback(() => {
    providerRef.current?.stop();
    providerRef.current = null;
    finishPhrase(false);
  }, [finishPhrase]);

  const skipPhrase = useCallback(() => {
    teardownProvider();
    finishPhrase(true);
  }, [finishPhrase, teardownProvider]);

  const nextPhrase = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, activeEntries.length - 1));
    setPhraseState("idle");
  }, [activeEntries.length]);

  const applyTestMode = useCallback(
    (mode: TestMode) => {
      teardownProvider();
      setTestMode(mode);
      if (mode === "quick") {
        setActiveEntries(QUICK_ENTRIES);
        setGrammarMode("quick");
      } else if (mode === "expanded") {
        setActiveEntries(EXPANDED_ENTRIES);
        setGrammarMode("expanded");
      } else {
        // Noise tests whichever grammar is currently active — see this
        // page's own top-of-file doc comment.
        setActiveEntries(NOISE_ENTRIES);
      }
      setCurrentIndex(0);
      setPhraseState("idle");
      setLastError(null);
      setRecords([]);
    },
    [teardownProvider]
  );

  const exportJson = useCallback(() => {
    const payload = {
      provider: providerChoice,
      testMode,
      grammarMode,
      voskProvenance: providerChoice === "vosk" ? VOSK_PROVENANCE : null,
      grammar: providerChoice === "vosk" ? (grammarMode === "expanded" ? VOSK_EXPANDED_GRAMMAR_PHRASES : VOSK_PROTOTYPE_GRAMMAR_PHRASES) : null,
      records,
      falseCardEventCount,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `native-voice-${testMode}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [falseCardEventCount, providerChoice, records, testMode, grammarMode]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-accent" aria-hidden />
          <h1 className="text-lg font-bold text-foreground">Native Voice Prototype</h1>
        </div>
        <Link href="/lab/mic-check" className="flex items-center gap-1 rounded-full bg-surface-raised px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent/20">
          <Mic className="h-3 w-3" aria-hidden /> Mic Check
        </Link>
      </div>
      <div className="rounded-lg border border-pending/40 bg-pending/10 p-3 text-xs text-pending">
        <strong>LAB PROTOTYPE — NOT PRODUCTION VOICE.</strong> English only. Never writes a CardEvent. Does not replace
        Browser Web Speech, Sherpa, Whisper, or production VoiceControl.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Acoustic engine:</span>
        <button
          type="button"
          onClick={() => switchProvider("vosk")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${providerChoice === "vosk" ? "bg-accent text-accent-foreground" : "bg-surface-raised text-muted-foreground"}`}
        >
          Vosk (offline, grammar-constrained)
        </button>
        <button
          type="button"
          onClick={() => switchProvider("browser-web-speech")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${providerChoice === "browser-web-speech" ? "bg-accent text-accent-foreground" : "bg-surface-raised text-muted-foreground"}`}
        >
          Browser Web Speech (reference)
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => applyTestMode("quick")}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold hover:bg-accent/20 ${testMode === "quick" ? "bg-accent text-accent-foreground" : "bg-surface-raised text-foreground"}`}
        >
          <RotateCcw className="h-3 w-3" aria-hidden /> Quick Smoke Test (7 phrases)
        </button>
        <button
          type="button"
          onClick={() => applyTestMode("expanded")}
          className={`rounded-full px-3 py-1 text-xs font-semibold hover:bg-accent/20 ${testMode === "expanded" ? "bg-accent text-accent-foreground" : "bg-surface-raised text-foreground"}`}
        >
          Native Voice Expanded English Test ({EXPANDED_ENTRIES.length} phrases)
        </button>
        <button
          type="button"
          onClick={() => applyTestMode("noise")}
          className={`rounded-full px-3 py-1 text-xs font-semibold hover:bg-accent/20 ${testMode === "noise" ? "bg-accent text-accent-foreground" : "bg-surface-raised text-foreground"}`}
        >
          Noise rejection set (vs. {grammarMode} grammar)
        </button>
        <button
          type="button"
          onClick={exportJson}
          disabled={records.length === 0}
          className="flex items-center gap-1 rounded-full bg-surface-raised px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent/20 disabled:opacity-40"
        >
          <Download className="h-3 w-3" aria-hidden /> Export JSON
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold text-muted-foreground">
          Phrase {currentIndex + 1} of {activeEntries.length}
          {currentEntry?.group && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted-foreground">{currentEntry.group}</span>}
        </p>
        <p className="mt-1 text-xl font-bold text-foreground" data-testid="expected-phrase">
          {currentPhrase ?? "(set complete)"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">Provider status: {providerStatus}</p>
        {lastError && <p className="mt-1 text-xs font-semibold text-destructive">Error: {lastError}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startPhrase}
            disabled={phraseState === "listening" || currentPhrase == null}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-40"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden /> Start Phrase
          </button>
          <button
            type="button"
            onClick={endPhrase}
            disabled={phraseState !== "listening"}
            className="flex items-center gap-1 rounded-lg bg-surface-raised px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-40"
          >
            <Square className="h-3.5 w-3.5" aria-hidden /> End Phrase
          </button>
          <button
            type="button"
            onClick={skipPhrase}
            disabled={phraseState === "listening" || currentPhrase == null}
            className="flex items-center gap-1 rounded-lg bg-surface-raised px-3 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-40"
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden /> Skip
          </button>
          <button
            type="button"
            onClick={nextPhrase}
            disabled={phraseState === "idle" || currentIndex >= activeEntries.length - 1}
            className="rounded-lg bg-surface-raised px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-40"
          >
            Next Phrase
          </button>
        </div>

        {records.length > 0 && records[records.length - 1].index === currentIndex && (
          <ResultPanel record={records[records.length - 1]} />
        )}
      </div>

      {records.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold text-foreground">
            Session results — {records.length} phrase{records.length === 1 ? "" : "s"} recorded
          </p>
          <p
            className={`mt-1 text-sm font-bold ${falseCardEventCount > 0 ? "text-destructive" : "text-status-green"}`}
            data-testid="false-cardevents-summary"
          >
            FALSE CARDEVENTS: {falseCardEventCount}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="p-1">#</th>
                  <th className="p-1">Group</th>
                  <th className="p-1">Expected</th>
                  <th className="p-1">Transcript</th>
                  <th className="p-1">Verdict</th>
                  <th className="p-1">Would CardEvent?</th>
                  <th className="p-1">False?</th>
                  <th className="p-1">Latency (ms)</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-1">{r.index + 1}</td>
                    <td className="p-1">{r.group ?? "—"}</td>
                    <td className="p-1">{r.phrase}</td>
                    <td className="p-1">{r.skipped ? "(skipped)" : (r.transcript ?? "(none)")}</td>
                    <td className="p-1">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${verdictBadgeClass(r.result?.verdict ?? null)}`}>
                        {r.skipped ? "SKIPPED" : (r.result?.verdict ?? (r.error ? "ERROR" : "—"))}
                      </span>
                    </td>
                    <td className="p-1">{r.result?.wouldProduceCardEvent ? "YES" : "no"}</td>
                    <td className="p-1">{!r.skipped && r.result && isFalseCardEvent(r.phrase, r.result.commands) ? "FALSE" : "—"}</td>
                    <td className="p-1">{r.finalMs != null ? Math.round(r.finalMs) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultPanel({ record }: { record: PhraseRecord }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-raised p-3 text-xs" data-testid="result-panel">
      <p>
        <span className="font-semibold text-muted-foreground">Raw transcript: </span>
        {record.skipped ? "(skipped)" : (record.transcript ?? "(no speech)")}
      </p>
      {record.error && <p className="mt-1 text-destructive">Error: {record.error}</p>}
      {!record.skipped && record.result && (
        <>
          <p className="mt-1">
            <span className="font-semibold text-muted-foreground">Verdict: </span>
            <span className={`rounded px-1.5 py-0.5 font-semibold ${verdictBadgeClass(record.result.verdict)}`}>{record.result.verdict}</span>
            {record.result.code && <span className="ml-2 text-muted-foreground">({record.result.code})</span>}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-muted-foreground">UniversalCommand: </span>
            <code className="break-all">{JSON.stringify(record.result.commands)}</code>
          </p>
          <p className={`mt-1 font-semibold ${record.result.wouldProduceCardEvent ? "text-destructive" : "text-status-green"}`}>
            Would produce a CardEvent: {record.result.wouldProduceCardEvent ? "YES" : "no"}
          </p>
        </>
      )}
      {record.voskDiagnostics && (
        <p className="mt-1 text-muted-foreground" data-testid="vosk-diagnostics">
          Vosk: {record.voskDiagnostics.audioChunksReceived} audio chunks · {record.voskDiagnostics.partialResultCount} partial(s)
          {record.voskDiagnostics.lastPartialText ? ` (last: "${record.voskDiagnostics.lastPartialText}")` : ""} · finalized by{" "}
          {record.voskDiagnostics.finalizedBy}
        </p>
      )}
      <p className="mt-1 text-muted-foreground">
        First interim: {record.firstInterimMs != null ? `${Math.round(record.firstInterimMs)}ms` : "—"} · Final:{" "}
        {record.finalMs != null ? `${Math.round(record.finalMs)}ms` : "—"}
      </p>
    </div>
  );
}
