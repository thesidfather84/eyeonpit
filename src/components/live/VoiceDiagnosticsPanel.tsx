"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { VoiceUtteranceSummary } from "@/lib/voice/voiceDiagnosticsTypes";

export interface VoiceDiagnosticEntry {
  id: number;
  time: string;
  label: string;
  detail: string;
}

export function formatVoiceDiagnosticsLog(entries: VoiceDiagnosticEntry[]): string {
  return entries.map((e) => `[${e.time}] ${e.label}${e.detail ? " — " + e.detail : ""}`).join("\n");
}

/**
 * The full exportable session — every raw log line PLUS every structured
 * per-utterance trace (alternatives, resolver winner/reason, active target
 * before/after, timing) — see VoiceUtteranceSummary's own doc comment.
 * Intentionally excludes anything from the investigation itself (no card
 * events, no counts, no casino/table identifiers): this is a voice-pipeline
 * debugging artifact, not investigation evidence, so it carries only what's
 * needed to diagnose a recognition/parsing problem.
 */
export function buildVoiceSessionExport(entries: VoiceDiagnosticEntry[], utterances: VoiceUtteranceSummary[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      utteranceCount: utterances.length,
      logEntryCount: entries.length,
      utterances,
      log: entries.map((e) => ({ time: e.time, label: e.label, detail: e.detail })),
    },
    null,
    2
  );
}

/** One compact "V-1042 | ... | ACCEPTED" line per utterance — section 14 of the voice reliability spec. Mirrors exactly what VoiceControl already appends as a SUMMARY log line; kept here too so the latest-utterance panel can show it without re-deriving it from raw log text. */
function summaryLine(u: VoiceUtteranceSummary): string {
  const altNote = u.winnerIndex != null && u.winnerIndex !== 0 ? ` | ALT${u.winnerIndex + 1} "${u.winningTranscript}"` : "";
  const raw = u.alternatives[0]?.transcript ?? "";
  return `${u.voiceEventId} | "${raw}"${altNote} | ${u.actionSummary} | ${u.outcome}${u.code ? ` (${u.code})` : ""}`;
}

/**
 * The latest-resolved-utterance detail view — Voice Event ID, every
 * alternative with its confidence, the winning one, active target
 * before/after, timing, and (when rejected) the structured rejection code.
 * `utterances` comes from VoiceControl's own N-best resolution — see
 * nBestResolver.ts and handleFinalResult's `finishUtterance` — and is empty
 * whenever nothing has reached resolution yet (note-mode dictation, a
 * pending confirmation phrase, or before the first utterance).
 */
function LatestUtterance({ utterance }: { utterance: VoiceUtteranceSummary }) {
  return (
    <div className="flex flex-none flex-col gap-1 border-b border-border p-2 font-mono text-[10px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">{utterance.voiceEventId}</span>
        {/* "Outcome: " prefix (rather than bare ACCEPTED/REJECTED) keeps this text distinct from the raw log's own plain "ACCEPTED"/"REJECTED" label lines below — both are real, independently useful text, but must never collide under an exact-text lookup. */}
        <span
          className={
            utterance.outcome === "ACCEPTED" ? "font-semibold text-status-green" : "font-semibold text-pending"
          }
        >
          Outcome: {utterance.outcome}
          {utterance.code ? ` (${utterance.code})` : ""}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 text-muted-foreground">
        {utterance.alternatives.map((a) => (
          <li key={a.index} className={a.index === utterance.winnerIndex ? "text-accent" : undefined}>
            {`${a.index === utterance.winnerIndex ? "→ " : "  "}#${a.index + 1} "${a.transcript}" (conf ${
              a.confidence == null ? "n/a" : a.confidence.toFixed(2)
            })`}
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground">
        Target: {utterance.activeTargetBefore}
        {utterance.activeTargetAfter && utterance.activeTargetAfter !== utterance.activeTargetBefore
          ? ` → ${utterance.activeTargetAfter}`
          : ""}
        {utterance.finalToCommitMs != null ? ` · ${utterance.finalToCommitMs.toFixed(0)}ms` : ""}
      </div>
      <div className="text-foreground">{summaryLine(utterance)}</div>
    </div>
  );
}

/**
 * A visible log of every recognition lifecycle event, transcript,
 * alternative, confidence, and error code, plus a one-tap way to get that
 * text off the phone. Hidden during normal operation — VoiceControl only
 * mounts this component at all once its "Debug" toggle has been
 * deliberately opened, regardless of how many entries have accumulated in
 * the background; it never appears on its own just because voice entry is
 * in use. `entries` (and therefore `id`) come from VoiceControl's own
 * monotonic counter, which never resets across start/stop sessions — see
 * `appendLog` there for why the id must be captured *before* the state
 * update, not read live from inside it.
 *
 * `utterances` is the richer, structured companion (see
 * VoiceUtteranceSummary) — optional and defaulted to empty so this
 * component still works exactly as before wherever it's used without it.
 * When present, the most recent one renders above the raw log as a
 * dedicated detail view, and "Copy Session JSON" becomes available
 * alongside the existing "Copy Voice Log" plain-text export.
 */
export function VoiceDiagnosticsPanel({
  entries,
  utterances = [],
}: {
  entries: VoiceDiagnosticEntry[];
  utterances?: VoiceUtteranceSummary[];
}) {
  const [copied, setCopied] = useState<"log" | "json" | null>(null);

  async function copy(kind: "log" | "json", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
    } catch {
      // Clipboard API unavailable or denied — the log stays visible and
      // selectable on screen either way, so there's nothing else to do.
    }
  }

  if (entries.length === 0) return null;

  const latest = utterances[utterances.length - 1];

  return (
    <div className="flex w-72 max-w-[80vw] flex-col rounded-xl border border-border bg-surface shadow-lg">
      <div className="flex flex-none items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Voice Diagnostics
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => copy("json", buildVoiceSessionExport(entries, utterances))}
            className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[10px] font-medium text-foreground"
          >
            {copied === "json" ? <Check className="h-3 w-3" aria-hidden /> : <Download className="h-3 w-3" aria-hidden />}
            {copied === "json" ? "Copied" : "Export JSON"}
          </button>
          <button
            type="button"
            onClick={() => copy("log", formatVoiceDiagnosticsLog(entries))}
            className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[10px] font-medium text-foreground"
          >
            {copied === "log" ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
            {copied === "log" ? "Copied" : "Copy Voice Log"}
          </button>
        </div>
      </div>
      {latest && <LatestUtterance utterance={latest} />}
      <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto p-2 font-mono text-[10px] text-muted-foreground">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="text-foreground">{e.label}</span>
            {e.detail && <span> — {e.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
