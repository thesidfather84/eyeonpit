// @vitest-environment jsdom
//
// Direct coverage of the continuous-listening lifecycle, isolated from
// VoiceControl's own parsing/dispatch concerns. jsdom has no real
// SpeechRecognition, so a small mock stands in — see VoiceControl.test.tsx
// for the same pattern applied end to end through the real component.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecognition } from "./useVoiceRecognition";

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

/** Real-browser behavior: onend always fires after onerror, whatever the error. The mock doesn't chain this automatically, so tests that need it simulate both explicitly, matching what a real SpeechRecognition implementation guarantees. */
function fireErrorThenEnd(instance: MockSpeechRecognition, error: string) {
  instance.onerror?.({ error });
  instance.onend?.();
}

beforeEach(() => {
  MockSpeechRecognition.reset();
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.restoreAllMocks();
});

describe("useVoiceRecognition — continuous listening", () => {
  it("start() turns listening on; a final result's own stop()+onend auto-restarts a fresh native session while listening stays on", async () => {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult }));

    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    act(() => {
      MockSpeechRecognition.latest().onresult?.(finalResult("ace"));
    });

    // The first session ended (its own onresult handler calls stop()) —
    // listening must stay true throughout, and a second native session
    // must appear shortly after, with no further tap.
    expect(result.current.listening).toBe(true);
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(2));
    expect(result.current.listening).toBe(true);
    expect(onFinalResult).toHaveBeenCalledTimes(1);
  });

  it("restarting works across several consecutive commands, never dropping listening in between", async () => {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult }));

    act(() => result.current.start());

    for (const word of ["dealer", "king", "ace"]) {
      const before = MockSpeechRecognition.instances.length;
      act(() => {
        MockSpeechRecognition.latest().onresult?.(finalResult(word));
      });
      await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(before));
      expect(result.current.listening).toBe(true);
    }

    expect(onFinalResult).toHaveBeenCalledTimes(3);
  });

  it("stop() turns listening off for good — the onend it triggers does not schedule a restart", async () => {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult }));

    act(() => result.current.start());
    const instance = MockSpeechRecognition.latest();

    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);

    // The real browser still fires onend after our stop() call — confirm
    // that does NOT resurrect a new session.
    act(() => {
      instance.onend?.();
    });
    // Give any (incorrectly) scheduled restart timer a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(result.current.listening).toBe(false);
    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });

  it("a fatal error (not-allowed) turns listening off and does not restart", async () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult, onError }));

    act(() => result.current.start());
    const instance = MockSpeechRecognition.latest();

    act(() => fireErrorThenEnd(instance, "not-allowed"));

    expect(result.current.listening).toBe(false);
    expect(onError).toHaveBeenCalledWith("not-allowed");
    await new Promise((resolve) => setTimeout(resolve, 150));
    // No restart — still exactly the one (now-dead) session.
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(result.current.listening).toBe(false);
  });

  it.each(["service-not-allowed", "audio-capture", "language-not-supported"])(
    "the fatal error %s also stops listening without restarting",
    async (error) => {
      const { result } = renderHook(() => useVoiceRecognition({ onFinalResult: vi.fn() }));
      act(() => result.current.start());
      const instance = MockSpeechRecognition.latest();

      act(() => fireErrorThenEnd(instance, error));

      expect(result.current.listening).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(MockSpeechRecognition.instances).toHaveLength(1);
    }
  );

  it("a transient error (no-speech) restarts while voice mode is still on", async () => {
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult: vi.fn() }));
    act(() => result.current.start());
    const instance = MockSpeechRecognition.latest();

    act(() => fireErrorThenEnd(instance, "no-speech"));

    expect(result.current.listening).toBe(true);
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(2));
    expect(result.current.listening).toBe(true);
  });
});

describe("useVoiceRecognition — offline/no-network behavior (mobile-first, offline-first)", () => {
  it("a single 'network' error is treated as transient and still restarts (a brief connectivity blip)", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult: vi.fn(), onError }));
    act(() => result.current.start());

    act(() => fireErrorThenEnd(MockSpeechRecognition.latest(), "network"));

    expect(result.current.listening).toBe(true);
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(2));
    expect(onError).toHaveBeenCalledWith("network");
    expect(onError).not.toHaveBeenCalledWith("network-unavailable");
  });

  it("repeated consecutive 'network' failures (a genuinely offline device) stop restarting and fire 'network-unavailable' exactly once, never looping forever", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult: vi.fn(), onError }));
    act(() => result.current.start());

    // Every single attempt fails the same way, as it would on a device
    // with no network access to the recognition service at all.
    for (let i = 0; i < 5; i++) {
      const before = MockSpeechRecognition.instances.length;
      act(() => fireErrorThenEnd(MockSpeechRecognition.latest(), "network"));
      if (result.current.listening) {
        await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(before));
      }
    }

    // Gave up well before 5 raw restarts, listening is off, and the
    // browser is never asked to start yet another doomed session.
    expect(result.current.listening).toBe(false);
    expect(onError).toHaveBeenCalledWith("network-unavailable");
    expect(onError.mock.calls.filter(([code]) => code === "network-unavailable")).toHaveLength(1);
    const instanceCountAtGiveUp = MockSpeechRecognition.instances.length;
    expect(instanceCountAtGiveUp).toBeLessThan(5);

    // No further restart is ever scheduled once given up.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(MockSpeechRecognition.instances).toHaveLength(instanceCountAtGiveUp);
  });

  it("a successful result in between resets the consecutive-network-failure count, so an intermittent connection doesn't accumulate toward giving up", async () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult, onError }));
    act(() => result.current.start());

    // Two network failures (short of the cap)...
    for (let i = 0; i < 2; i++) {
      const before = MockSpeechRecognition.instances.length;
      act(() => fireErrorThenEnd(MockSpeechRecognition.latest(), "network"));
      await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(before));
    }
    // ...then a genuinely successful command...
    const beforeResult = MockSpeechRecognition.instances.length;
    act(() => {
      MockSpeechRecognition.latest().onresult?.(finalResult("ace"));
    });
    await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(beforeResult));
    // ...then two more network failures — still short of the cap counted
    // from scratch, so listening must still be on, not given up.
    for (let i = 0; i < 2; i++) {
      const before = MockSpeechRecognition.instances.length;
      act(() => fireErrorThenEnd(MockSpeechRecognition.latest(), "network"));
      await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(before));
    }

    expect(result.current.listening).toBe(true);
    expect(onError).not.toHaveBeenCalledWith("network-unavailable");
  });
});

describe("useVoiceRecognition — session/dispatch guarantees", () => {
  it("a final result never dispatches twice across a restart (no duplicate CardEvents from the same spoken command)", async () => {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useVoiceRecognition({ onFinalResult }));

    act(() => result.current.start());
    const first = MockSpeechRecognition.latest();

    act(() => {
      // A real engine occasionally fires more than one final
      // SpeechRecognitionResult for a single utterance before onend.
      first.onresult?.(finalResult("ace"));
      first.onresult?.(finalResult("ace"));
    });
    expect(onFinalResult).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(2));
    const second = MockSpeechRecognition.latest();
    act(() => {
      second.onresult?.(finalResult("king"));
    });
    // The restarted session's own guard resets independently — one more
    // dispatch for the new command, still never more than one per session.
    expect(onFinalResult).toHaveBeenCalledTimes(2);
  });

  it("unmounting mid-session never leaves a restart scheduled", async () => {
    const { result, unmount } = renderHook(() => useVoiceRecognition({ onFinalResult: vi.fn() }));
    act(() => result.current.start());
    const instance = MockSpeechRecognition.latest();

    unmount();
    act(() => {
      instance.onend?.();
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(MockSpeechRecognition.instances).toHaveLength(1);
  });
});
