// @vitest-environment jsdom
//
// REGRESSION, 2026-08-21 — real production bug: a real Start Phrase →
// speak → End Phrase cycle against the isolated Whisper origin could
// silently produce NO record at all. Two compounding bugs, both in this
// provider's own message-lifecycle bookkeeping (not in Whisper inference,
// not in whisper-static-lab's own C++ runtime, not in any other
// provider): stop() removed its message listener synchronously, before
// the isolated origin's own (necessarily asynchronous) reply could ever
// arrive; and the isolated origin only replied at all when whisper.cpp's
// own VAD happened to fire during listening, which a real End Phrase
// click routinely never gives it a chance to do. See
// whisperCppProvider.ts's own REGRESSION doc comment above stop() for the
// full mechanism, and index.html's own endPhrase() doc comment (in the
// isolated whisper-static-lab project, not this repo) for the matching
// harness-side fix.
//
// Unlike whisperCppProvider.test.ts (plain Node, no window — pure logic
// only), these tests exercise the REAL start()/stop() message-driven
// state machine in a real DOM: a real <iframe> element gets created,
// window-level `message` events are dispatched exactly as the browser
// would deliver them (with a real, spoofable-only-by-the-browser
// `origin` field), and the assertions are about what the PROVIDER does
// in response — never about whether jsdom's iframe actually navigates
// anywhere (it doesn't; the isolated origin's own real behavior was
// verified separately, in a real browser — see the round's own final
// report).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWhisperCppProvider,
  END_PHRASE_NO_REPLY_MESSAGE,
  STOP_REPLY_TIMEOUT_MS,
  __resetWhisperSessionForTests,
  type WhisperCppProviderOptions,
} from "./whisperCppProvider";
import type { SpeechProvider } from "./speechProvider";

const WHISPER_ORIGIN = "https://whisper-static-lab.vercel.app";

function dispatchFromWhisper(data: unknown, origin: string = WHISPER_ORIGIN) {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

/** Simulates the iframe having finished loading (real navigation never happens in jsdom) — matches whisperCppProvider.ts's own ensureSession(), which waits for exactly this DOM event before sending whisper:start-phrase. */
function fireIframeLoad() {
  const iframe = document.querySelector("iframe");
  iframe?.dispatchEvent(new Event("load"));
}

/** Drives a provider all the way to "listening" — the real, verified sequence: iframe load, then whisper:start-phrase is sent, then this replies with whisper:status:"listening". */
async function startAndReachListening(provider: SpeechProvider) {
  const startPromise = provider.start();
  await Promise.resolve();
  fireIframeLoad();
  await Promise.resolve();
  dispatchFromWhisper({ type: "whisper:status", status: "listening" });
  await startPromise;
}

function makeProvider(overrides: Partial<WhisperCppProviderOptions> = {}) {
  const onFinalResult = vi.fn();
  const onError = vi.fn();
  const onAudioStart = vi.fn();
  const onAudioEnd = vi.fn();
  const provider = createWhisperCppProvider({
    onFinalResult,
    onError,
    onAudioStart,
    onAudioEnd,
    whisperOrigin: WHISPER_ORIGIN,
    ...overrides,
  });
  return { provider, onFinalResult, onError, onAudioStart, onAudioEnd };
}

// jsdom does not actually navigate <iframe> elements (this module's own
// existing top-of-file doc comment already discloses this), and its
// `contentWindow` for an un-navigated iframe is not reliably usable with
// `postMessage()` — real testing found calling it threw a jsdom-internal
// error. The provider's own outbound postMessage calls (whisper:start-
// phrase/whisper:end-phrase) are not what these tests are verifying —
// only the PROVIDER's reaction to inbound replies is — so contentWindow
// is stubbed to a harmless spy for the whole file, sidestepping jsdom's
// unsupported path entirely without weakening any real assertion.
let contentWindowSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // See __resetWhisperSessionForTests()'s own doc comment — the
  // module-scope session singleton is deliberately shared ACROSS phrases
  // within one real page load, which also means across tests within this
  // file unless reset here.
  __resetWhisperSessionForTests();
  contentWindowSpy = vi
    .spyOn(window.HTMLIFrameElement.prototype, "contentWindow", "get")
    .mockReturnValue({ postMessage: vi.fn() } as unknown as Window);
});
afterEach(() => {
  contentWindowSpy.mockRestore();
  __resetWhisperSessionForTests();
});

describe("Whisper session lifecycle — Start Phrase creates/tracks session state", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reports iframe embedding as supported in a real DOM", () => {
    const { provider } = makeProvider();
    expect(provider.supported).toBe(true);
  });

  it("start() creates the isolated-origin iframe, pointed at the configured whisperOrigin", async () => {
    const { provider } = makeProvider();
    provider.start();
    await Promise.resolve();
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toBe(`${WHISPER_ORIGIN}/`);
  });

  it("start() resolves to a tracked listening session once the iframe confirms whisper:status listening", async () => {
    const { provider, onAudioStart } = makeProvider();
    await startAndReachListening(provider);
    expect(onAudioStart).toHaveBeenCalledTimes(1);
  });

  it("a message from an untrusted origin is ignored even mid-session — never treated as a real reply", async () => {
    const { provider, onAudioStart } = makeProvider();
    const startPromise = provider.start();
    await Promise.resolve();
    fireIframeLoad();
    await Promise.resolve();
    dispatchFromWhisper({ type: "whisper:status", status: "listening" }, "https://evil.example.com");
    // Real reply, now from the trusted origin — this is the one that
    // should actually resolve start().
    dispatchFromWhisper({ type: "whisper:status", status: "listening" });
    await startPromise;
    expect(onAudioStart).toHaveBeenCalledTimes(1);
  });
});

describe("Whisper session lifecycle — whisper:final creates a record", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a whisper:final received while listening produces a real final result", async () => {
    const { provider, onFinalResult } = makeProvider();
    await startAndReachListening(provider);
    dispatchFromWhisper({ type: "whisper:final", text: "Dealer has a king" });
    expect(onFinalResult).toHaveBeenCalledTimes(1);
    expect(onFinalResult).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "Dealer has a king", isFinal: true })
    );
  });
});

describe("Whisper session lifecycle — whisper:error creates a record", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a whisper:error received while listening produces a real, surfaced error", async () => {
    const { provider, onError } = makeProvider();
    await startAndReachListening(provider);
    dispatchFromWhisper({ type: "whisper:error", message: "no speech detected" });
    expect(onError).toHaveBeenCalledWith("no speech detected");
  });
});

describe("Whisper session lifecycle — REGRESSION: End Phrase without an already-arrived final does not silently disappear", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a whisper:final that arrives AFTER stop() was called (VAD never fired during listening, only on the forced End Phrase finalize) still produces a real record — proves the listener was not removed too early", async () => {
    const { provider, onFinalResult, onAudioEnd } = makeProvider();
    await startAndReachListening(provider);

    provider.stop();
    // The real sequence: the isolated origin's own forced-finalize
    // transcription (see command_force_finalize()) takes real,
    // non-instant work — the reply is never synchronous with stop()
    // itself.
    await Promise.resolve();
    expect(onFinalResult).not.toHaveBeenCalled();
    expect(onAudioEnd).not.toHaveBeenCalled();

    dispatchFromWhisper({ type: "whisper:final", text: "Dealer has a five" });

    expect(onFinalResult).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "Dealer has a five", isFinal: true })
    );
    expect(onAudioEnd).toHaveBeenCalledTimes(1);
  });

  it("a whisper:error that arrives AFTER stop() (forced finalize found no speech) still surfaces a real error — an empty/failed recognition is never silently dropped", async () => {
    const { provider, onError, onAudioEnd } = makeProvider();
    await startAndReachListening(provider);

    provider.stop();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();

    dispatchFromWhisper({ type: "whisper:error", message: "no speech detected" });

    expect(onError).toHaveBeenCalledWith("no speech detected");
    expect(onAudioEnd).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION (the exact real bug): if stop() removed its listener synchronously, this reply would be lost — asserts it is NOT lost across a real macrotask boundary too, not just a microtask", async () => {
    const { provider, onFinalResult } = makeProvider();
    await startAndReachListening(provider);
    provider.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    dispatchFromWhisper({ type: "whisper:final", text: "Split" });
    expect(onFinalResult).toHaveBeenCalledWith(expect.objectContaining({ transcript: "Split" }));
  });

  it("if the isolated origin never replies at all, stop() still eventually surfaces a real, disclosed error rather than hanging forever — a genuine failure still creates a record", async () => {
    vi.useFakeTimers();
    try {
      const { provider, onError, onAudioEnd } = makeProvider();
      const startPromise = provider.start();
      await Promise.resolve();
      fireIframeLoad();
      await Promise.resolve();
      dispatchFromWhisper({ type: "whisper:status", status: "listening" });
      await startPromise;

      provider.stop();
      expect(onError).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(STOP_REPLY_TIMEOUT_MS);

      expect(onError).toHaveBeenCalledWith(END_PHRASE_NO_REPLY_MESSAGE);
      expect(onAudioEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("when VAD already produced a final DURING listening (before End Phrase), stop() completes immediately without waiting for a second reply, and a later stray duplicate is ignored", async () => {
    const { provider, onFinalResult, onAudioEnd } = makeProvider();
    await startAndReachListening(provider);

    dispatchFromWhisper({ type: "whisper:final", text: "Dealer has an ace" });
    expect(onFinalResult).toHaveBeenCalledTimes(1);

    provider.stop();
    // No second reply needed — the harness's own endPhrase() knows not to
    // send one when a result was already sent (see its own doc comment);
    // stop() must not wait for one either.
    expect(onAudioEnd).toHaveBeenCalledTimes(1);

    // A stray extra message (should never happen with the real harness,
    // but proves the listener was actually detached, not left dangling).
    dispatchFromWhisper({ type: "whisper:final", text: "duplicate, should be ignored" });
    expect(onFinalResult).toHaveBeenCalledTimes(1);
  });
});

describe("Whisper session lifecycle — provider switching/reset behavior stays correct", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starting a new phrase after a completed one reuses the session's iframe rather than creating a second one", async () => {
    const { provider, onFinalResult } = makeProvider();
    await startAndReachListening(provider);
    dispatchFromWhisper({ type: "whisper:final", text: "Seven" });
    provider.stop();
    expect(document.querySelectorAll("iframe").length).toBe(1);

    const second = makeProvider().provider;
    const startPromise = second.start();
    await Promise.resolve();
    // No new iframe load needed — the session (and its iframe) persists
    // across phrases; a second provider instance for a later phrase reuses it.
    dispatchFromWhisper({ type: "whisper:status", status: "listening" });
    await startPromise;
    expect(document.querySelectorAll("iframe").length).toBe(1);
    void onFinalResult;
  });

  it("a construction-time-only whisperOrigin never bypasses the trusted-origin check for messages from a different origin — a reply from the wrong origin genuinely times out rather than silently succeeding", async () => {
    vi.useFakeTimers();
    try {
      const { provider, onFinalResult, onError } = makeProvider({ whisperOrigin: "https://a-different-whisper-origin.example.com" });
      const startPromise = provider.start();
      await Promise.resolve();
      fireIframeLoad();
      await Promise.resolve();
      // Reply arrives from the ORIGINAL default origin, not the one this
      // provider was actually configured with — must be ignored.
      dispatchFromWhisper({ type: "whisper:status", status: "listening" }, WHISPER_ORIGIN);
      await Promise.resolve();
      dispatchFromWhisper({ type: "whisper:final", text: "should never arrive" }, WHISPER_ORIGIN);
      expect(onFinalResult).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(20000);
      await startPromise;
      expect(onError).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
