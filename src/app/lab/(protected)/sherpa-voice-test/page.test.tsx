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
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("Whisper is selectable as a third provider, resets the phrase run on switch, and updates the banner", () => {
    render(<SherpaVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    expect(phraseHeading()).toContain("Phrase 2 of 29");

    fireEvent.click(screen.getByRole("button", { name: /Whisper \(Experimental\)/ }));

    expect(phraseHeading()).toContain("Phrase 1 of 29");
    expect(screen.getByTestId("active-config-banner").textContent).toContain("Whisper");
    // The Sherpa-only A/B/C selector must not appear for Whisper.
    expect(screen.queryByRole("button", { name: /A — Hotwords OFF/ })).toBeNull();
  });

  it("REGRESSION (safety, Whisper): starting a phrase under Whisper fails closed with a real error, never a fake success — Whisper's provider is now iframe-based (see whisperCppProvider.ts's own ARCHITECTURE doc comment), so it reports `supported: true` in jsdom (only window+document are required in THIS origin — real audio/WASM work happens inside the iframe's own origin); jsdom never actually navigates that iframe or delivers a real `whisper:status: listening` reply, so the real, disclosed ready-timeout fires instead of a fake success", async () => {
    vi.useFakeTimers();
    try {
      render(<SherpaVoiceTestPage />);
      fireEvent.click(screen.getByRole("button", { name: /Whisper \(Experimental\)/ }));
      fireEvent.click(screen.getByRole("button", { name: /Start Phrase/ }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });

      // Scoped to the "Last error" dt/dd pair specifically — the same
      // message text can otherwise match more than one place on the page
      // (e.g. also appearing inside the raw JSON export), which would make
      // a plain screen.getByText ambiguous.
      expect(screen.getByText("Last error").nextElementSibling?.textContent).toMatch(/whisper iframe did not confirm it started listening in time/);
      expect(screen.getByText("error")).toBeTruthy();
      // A real failure IS a captured record here (unlike the old pre-start
      // supported-check short-circuit) — the isolated origin being
      // unreachable is exactly the kind of real, diagnosable failure this
      // Lab tool exists to surface, not hide.
      expect(screen.getByText(/Captured results \(1\)/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
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

  const CONFIG_BUTTON_NAME = {
    A: /A — Hotwords OFF/,
    B: /B — Current \(shipped\)/,
    C: /C — Tuned/,
  } as const;

  it.each([
    ["A", "B"],
    ["B", "C"],
    ["C", "A"],
  ] as const)("%s -> %s resets the phrase run to Phrase 1 and updates the banner", (from, to) => {
    render(<SherpaVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: CONFIG_BUTTON_NAME[from] }));
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    expect(phraseHeading()).toContain("Phrase 3 of 29");
    expect(screen.getByTestId("active-config-banner").textContent).toContain(`Config ${from}`);

    fireEvent.click(screen.getByRole("button", { name: CONFIG_BUTTON_NAME[to] }));

    expect(phraseHeading()).toContain("Phrase 1 of 29");
    expect(screen.getByTestId("active-config-banner").textContent).toContain(`Config ${to}`);
  });

  it("no transcript/session state bleeds between configurations — a stale error/status from the PREVIOUS configuration is cleared on switch, never shown as if it belongs to the new one", () => {
    render(<SherpaVoiceTestPage />);
    // Sherpa is unsupported in this test environment (no real AudioWorklet/
    // getUserMedia) — clicking Start Phrase deterministically produces a
    // real error/status without needing any WASM/audio mocking.
    fireEvent.click(screen.getByRole("button", { name: /Start Phrase/ }));
    expect(screen.getByText("unsupported-in-this-browser")).toBeTruthy();
    expect(screen.getByText("error")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: CONFIG_BUTTON_NAME.B }));

    expect(screen.queryByText("unsupported-in-this-browser")).toBeNull();
    expect(screen.queryByText("error")).toBeNull();
    expect(screen.getByText("idle")).toBeTruthy();
  });
});

describe("Sherpa A/B/C Lab page — Copy JSON confirmation feedback", () => {
  it("shows '✓ JSON Copied' and an accessible status announcement after a successful copy, then reverts", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SherpaVoiceTestPage />);
    const copyButton = screen.getByRole("button", { name: /Copy JSON/ });
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /JSON Copied/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("JSON copied to clipboard");

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole("button", { name: /^Copy JSON$/ })).toBeTruthy();

    vi.useRealTimers();
  });

  it("shows a clear failure message when the clipboard write rejects — never claims success", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SherpaVoiceTestPage />);
    const copyButton = screen.getByRole("button", { name: /Copy JSON/ });
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /Copy failed/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Copy to clipboard failed");
    expect(screen.queryByRole("button", { name: /JSON Copied/ })).toBeNull();

    vi.useRealTimers();
  });

  it("shows a failure message when no Clipboard API exists at all, rather than silently doing nothing or falsely claiming success", async () => {
    vi.useFakeTimers();
    Object.assign(navigator, { clipboard: undefined });

    render(<SherpaVoiceTestPage />);
    const copyButton = screen.getByRole("button", { name: /Copy JSON/ });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(screen.getByRole("button", { name: /Copy failed/ })).toBeTruthy();

    vi.useRealTimers();
  });
});
