// @vitest-environment jsdom
//
// Direct coverage proving BrowserWebSpeechProvider reproduces
// useVoiceRecognition.ts's own already-proven session/restart/backoff
// behavior — same mock pattern as useVoiceRecognition.test.ts (jsdom has
// no real SpeechRecognition), applied to the new plain-factory shape
// instead of a React hook.
import { waitFor } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserWebSpeechProvider as createProviderImpl, BROWSER_WEB_SPEECH_PROVIDER_ID } from "./browserWebSpeechProvider";
import type { SpeechProvider, SpeechProviderOptions } from "./speechProvider";

/**
 * Unlike useVoiceRecognition (a React hook, automatically stopped by
 * React Testing Library's own unmount cleanup between tests), a plain
 * provider instance has no automatic lifecycle tied to the test runner —
 * a test that leaves `voiceMode` true with a pending restart timer would
 * otherwise leak a live setTimeout into a LATER test, corrupting its
 * MockSpeechRecognition.instances count. Every provider created via this
 * helper is force-stopped in afterEach.
 */
let createdProviders: SpeechProvider[] = [];
function makeProvider(options: SpeechProviderOptions): SpeechProvider {
  const provider = createProviderImpl(options);
  createdProviders.push(provider);
  return provider;
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onsoundstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onsoundend: (() => void) | null = null;
  onaudioend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }

  static latest(): MockSpeechRecognition {
    const instance = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    if (!instance) throw new Error("No MockSpeechRecognition instance was created.");
    return instance;
  }

  static reset() {
    MockSpeechRecognition.instances = [];
  }
}

function finalResult(transcript: string, confidence = 0.9) {
  const alt = { transcript, confidence };
  const result = { isFinal: true, length: 1, 0: alt };
  return { resultIndex: 0, results: { length: 1, 0: result } };
}

function fireErrorThenEnd(instance: MockSpeechRecognition, error: string) {
  instance.onerror?.({ error });
  instance.onend?.();
}

beforeEach(() => {
  MockSpeechRecognition.reset();
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;
});

afterEach(() => {
  for (const provider of createdProviders) provider.stop();
  createdProviders = [];
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.restoreAllMocks();
});

describe("BrowserWebSpeechProvider — identity", () => {
  it("reports its providerId and supported flag", () => {
    const provider = makeProvider({ onFinalResult: vi.fn() });
    expect(provider.providerId).toBe(BROWSER_WEB_SPEECH_PROVIDER_ID);
    expect(provider.supported).toBe(true);
  });

  it("supported is false when no SpeechRecognition constructor exists", () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    const provider = makeProvider({ onFinalResult: vi.fn() });
    expect(provider.supported).toBe(false);
  });
});

describe("BrowserWebSpeechProvider — continuous listening (mirrors useVoiceRecognition.ts)", () => {
  it("start() begins a session; a final result auto-restarts a fresh session without a further start() call", async () => {
    const onFinalResult = vi.fn();
    const provider = makeProvider({ onFinalResult });

    provider.start();
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    MockSpeechRecognition.latest().onresult?.(finalResult("ace"));

    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(2));
    expect(onFinalResult).toHaveBeenCalledTimes(1);
  });

  it("stop() prevents the restart its own onend would otherwise trigger", async () => {
    const onFinalResult = vi.fn();
    const provider = makeProvider({ onFinalResult });

    provider.start();
    const instance = MockSpeechRecognition.latest();
    provider.stop();
    instance.onend?.();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });

  it("at most one final result is forwarded per native session, even if onresult fires twice", () => {
    const onFinalResult = vi.fn();
    const provider = makeProvider({ onFinalResult });
    provider.start();
    const instance = MockSpeechRecognition.latest();

    instance.onresult?.(finalResult("ace"));
    instance.onresult?.(finalResult("king"));

    expect(onFinalResult).toHaveBeenCalledTimes(1);
  });

  it("interim results are forwarded to onInterimResult, never onFinalResult", () => {
    const onFinalResult = vi.fn();
    const onInterimResult = vi.fn();
    const provider = makeProvider({ onFinalResult, onInterimResult });
    provider.start();

    const alt = { transcript: "dea", confidence: 0.4 };
    const interim = { resultIndex: 0, results: { length: 1, 0: { isFinal: false, length: 1, 0: alt } } };
    MockSpeechRecognition.latest().onresult?.(interim);

    expect(onInterimResult).toHaveBeenCalledTimes(1);
    expect(onFinalResult).not.toHaveBeenCalled();
  });
});

describe("BrowserWebSpeechProvider — TTS self-hearing suppression", () => {
  it("suppressForSpeech stops the current session and blocks the restart; resumeAfterSpeech begins a fresh one", async () => {
    const onFinalResult = vi.fn();
    const provider = makeProvider({ onFinalResult });
    provider.start();
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    provider.suppressForSpeech();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(MockSpeechRecognition.instances).toHaveLength(1); // no restart while suppressed

    provider.resumeAfterSpeech();
    expect(MockSpeechRecognition.instances).toHaveLength(2);
  });
});

describe("BrowserWebSpeechProvider — network-error backoff", () => {
  it('gives up after 3 consecutive "network" errors and fires "network-unavailable" instead of restarting again', async () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const provider = makeProvider({ onFinalResult, onError });
    provider.start();

    for (let i = 0; i < 3; i++) {
      const before = MockSpeechRecognition.instances.length;
      fireErrorThenEnd(MockSpeechRecognition.latest(), "network");
      if (i < 2) {
        await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(before));
      }
    }

    await waitFor(() => expect(onError).toHaveBeenCalledWith("network-unavailable"));
    // No further session was started once exhausted.
    const countAfterExhaustion = MockSpeechRecognition.instances.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(MockSpeechRecognition.instances.length).toBe(countAfterExhaustion);
  });

  it("a fatal error (not-allowed) never restarts", async () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const provider = makeProvider({ onFinalResult, onError });
    provider.start();

    fireErrorThenEnd(MockSpeechRecognition.latest(), "not-allowed");

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith("not-allowed");
  });
});
