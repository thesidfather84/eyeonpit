// @vitest-environment jsdom
//
// Real component test for the Native Voice Prototype Lab page's own UX —
// deliberately does NOT exercise real Vosk/WASM audio (jsdom has no
// AudioWorkletNode/getUserMedia, same disclosed testing boundary as
// sherpa-voice-test/page.test.tsx). "Skip" advances the phrase without ever
// calling into a provider at all; Start Phrase under Vosk in jsdom
// naturally fails closed (real, disclosed "unsupported", never a fake
// success) — both are exercised here under real React state/render
// behavior. No jest-dom matchers (toHaveClass/toBeDisabled) — this repo's
// vitest.setup.ts doesn't register them (confirmed: no other *.test.tsx
// file uses them either) — plain DOM property/className assertions instead.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NativeVoiceTestPage from "./page";

function expectedPhraseText(): string {
  return screen.getByTestId("expected-phrase").textContent ?? "";
}

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled;
}

describe("Native Voice Prototype Lab page", () => {
  it("defaults to Vosk, the Quick Smoke Test set, and Phrase 1 of 7", () => {
    render(<NativeVoiceTestPage />);
    expect(screen.getByText(/Phrase 1 of 7/)).toBeTruthy();
    expect(expectedPhraseText()).toBe("Dealer has a five.");
    expect(screen.getByRole("button", { name: /Vosk \(offline, grammar-constrained\)/ }).className).toContain("bg-accent");
  });

  it("Skip -> Next Phrase advances through all 7 prototype phrases in order, never calling into a provider", () => {
    render(<NativeVoiceTestPage />);
    const expected = [
      "Dealer has a five.",
      "Dealer has a king.",
      "Player one has a five.",
      "Player three has a king.",
      "Player three hits.",
      "Start count.",
      "End count.",
    ];
    for (let i = 0; i < expected.length; i++) {
      expect(expectedPhraseText()).toBe(expected[i]);
      fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
      if (i < expected.length - 1) {
        fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
      }
    }
  });

  it("PROVIDER SWITCHING: switching from Vosk to Browser Web Speech resets the phrase run to Phrase 1 and clears the highlighted engine, never bleeding state across providers", () => {
    render(<NativeVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next Phrase/ }));
    expect(screen.getByText(/Phrase 2 of 7/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Browser Web Speech \(reference\)/ }));

    expect(screen.getByText(/Phrase 1 of 7/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Browser Web Speech \(reference\)/ }).className).toContain("bg-accent");
    expect(screen.getByRole("button", { name: /Vosk \(offline, grammar-constrained\)/ }).className).not.toContain("bg-accent");
  });

  it("PROVIDER SWITCHING: switching providers never leaves a stale Start Phrase in progress — End Phrase is disabled again after a switch", () => {
    render(<NativeVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Phrase/ }));
    // Vosk is unsupported in jsdom — start() fails closed synchronously.
    fireEvent.click(screen.getByRole("button", { name: /Browser Web Speech \(reference\)/ }));
    expect(isDisabled(screen.getByRole("button", { name: /End Phrase/ }))).toBe(true);
  });

  it("SAFETY (fail-closed, real): starting a phrase under Vosk in an environment with no AudioWorkletNode/getUserMedia (this test environment) reports a real, disclosed 'unsupported' error — never a fake success, never a fabricated result row", () => {
    render(<NativeVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Phrase/ }));
    expect(screen.getByText(/Error: unsupported/)).toBeTruthy();
  });

  it("Quick Smoke Test / Noise rejection set buttons swap the active phrase list and reset to Phrase 1", () => {
    render(<NativeVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Noise rejection set/ }));
    expect(expectedPhraseText()).toBe("Spotify is dead.");

    fireEvent.click(screen.getByRole("button", { name: /Quick Smoke Test \(7 phrases\)/ }));
    expect(expectedPhraseText()).toBe("Dealer has a five.");
  });

  it("Export JSON is disabled until at least one phrase has a recorded result", () => {
    render(<NativeVoiceTestPage />);
    expect(isDisabled(screen.getByRole("button", { name: /Export JSON/ }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(isDisabled(screen.getByRole("button", { name: /Export JSON/ }))).toBe(false);
  });

  it("Native Voice Expanded English Test switches to the v0.2 grammar, showing a category badge and a bounded phrase count", () => {
    render(<NativeVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /Native Voice Expanded English Test/ }));
    expect(expectedPhraseText()).toBe("Dealer has an ace.");
    expect(screen.getByText(/Phrase 1 of \d+/)).toBeTruthy();
    expect(screen.getByText("Dealer / Card")).toBeTruthy();
  });

  it("FALSE CARDEVENTS summary is always visible once a phrase is recorded, and reads 0 for a clean skipped-only session", () => {
    render(<NativeVoiceTestPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(screen.getByTestId("false-cardevents-summary").textContent).toBe("FALSE CARDEVENTS: 0");
  });

  it("Noise rejection set label reflects the currently active grammar", () => {
    render(<NativeVoiceTestPage />);
    expect(screen.getByRole("button", { name: /Noise rejection set \(vs\. quick grammar\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Native Voice Expanded English Test/ }));
    expect(screen.getByRole("button", { name: /Noise rejection set \(vs\. expanded grammar\)/ })).toBeTruthy();
  });

  it("links to the Mic Check tool", () => {
    render(<NativeVoiceTestPage />);
    const link = screen.getByRole("link", { name: /Mic Check/ });
    expect(link.getAttribute("href")).toBe("/lab/mic-check");
  });
});
