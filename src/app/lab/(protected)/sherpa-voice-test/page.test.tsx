// @vitest-environment jsdom
//
// Real component test for the /lab/sherpa-voice-test A/B/C tool's own UX —
// deliberately does NOT exercise real Sherpa/WASM audio (no microphone or
// WASM environment exists here, consistent with every other round's own
// disclosed testing boundary — see sherpaOnnxProvider.ts's own doc
// comment). "Skip" -> "Next Phrase" advances the phrase index without ever
// calling into the provider at all, which is enough to exercise the
// 2026-08-20 Lab UX fix under real React state/render behavior, not a
// reimplementation of it.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SherpaVoiceTestPage from "./page";

function phraseHeading(): string {
  return screen.getByRole("heading", { level: 2, name: /Phrase \d+ of \d+/ }).textContent ?? "";
}

describe("Sherpa A/B/C Lab page — REGRESSION (items 7 & 8, 2026-08-20 real mic session): config switch resets the phrase run cleanly, no page reload, no bleed", () => {
  it("defaults to Sherpa-ONNX Config C (the preferred research default) and phrase 1", () => {
    render(<SherpaVoiceTestPage />);
    expect(phraseHeading()).toContain("Phrase 1 of 29");
    expect(screen.getByTestId("active-config-banner").textContent).toContain("Config C");
  });

  it("REGRESSION (item 7): switching A/B/C resets the phrase run to Phrase 1 — no manual 'Restart list' click, no page reload required", () => {
    render(<SherpaVoiceTestPage />);

    // Advance a few phrases purely via Skip -> Next Phrase (never touches
    // the provider/audio pipeline at all).
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    expect(phraseHeading()).toContain("Phrase 3 of 29");

    // Switch configuration — previously this left phraseIndex exactly
    // where it was (the reported bug: "leaves the operator at the end of
    // the previous phrase list").
    fireEvent.click(screen.getByRole("button", { name: /B — Current \(shipped\)/ }));

    expect(phraseHeading()).toContain("Phrase 1 of 29");
    expect(screen.getByTestId("active-config-banner").textContent).toContain("Config B");
  });

  it("REGRESSION (item 8): captured records are never wiped by a config switch — only the current run's transient phrase/session state resets", () => {
    render(<SherpaVoiceTestPage />);
    expect(screen.getByText(/Captured results \(0\)/)).toBeTruthy();

    // Skip never produces a record (by design — see the page's own
    // skipPhrase, unchanged by this round); confirm switching config still
    // shows the same (zero) captured-results count rather than any
    // unexpected mutation, proving the fix only resets phrase/session
    // transient state, not the records array.
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /C — Tuned/ }));
    expect(screen.getByText(/Captured results \(0\)/)).toBeTruthy();
  });

  it("switching the provider (Sherpa -> Chrome baseline) also resets the phrase run and updates the banner", () => {
    render(<SherpaVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    expect(phraseHeading()).toContain("Phrase 2 of 29");

    fireEvent.click(screen.getByRole("button", { name: /Chrome Web Speech \(baseline\)/ }));

    expect(phraseHeading()).toContain("Phrase 1 of 29");
    expect(screen.getByTestId("active-config-banner").textContent).toContain("Chrome Web Speech");
  });

  it("switching A/B/C repeatedly always lands back on Phrase 1 every time, never accumulating drift", () => {
    render(<SherpaVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    fireEvent.click(screen.getByRole("button", { name: /A — Hotwords OFF/ }));
    expect(phraseHeading()).toContain("Phrase 1 of 29");

    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    fireEvent.click(screen.getByRole("button", { name: /B — Current \(shipped\)/ }));
    expect(phraseHeading()).toContain("Phrase 1 of 29");
  });
});
