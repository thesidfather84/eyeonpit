"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

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
 * Diagnostic beta only — a visible log of every recognition lifecycle
 * event, transcript, alternative, confidence, and error code, plus a
 * one-tap way to get that text off the phone. Purely additive to
 * VoiceControl's existing mic button/status pill; doesn't replace or
 * restructure either.
 */
export function VoiceDiagnosticsPanel({ entries }: { entries: VoiceDiagnosticEntry[] }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = formatVoiceDiagnosticsLog(entries);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable or denied — the log stays visible and
      // selectable on screen either way, so there's nothing else to do.
    }
  }

  if (entries.length === 0) return null;

  return (
    <div className="flex w-72 max-w-[80vw] flex-col rounded-xl border border-border bg-surface shadow-lg">
      <div className="flex flex-none items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Voice Diagnostics
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[10px] font-medium text-foreground"
        >
          {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? "Copied" : "Copy Voice Log"}
        </button>
      </div>
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
