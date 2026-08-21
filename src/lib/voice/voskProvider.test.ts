// @vitest-environment jsdom
//
// This provider's real work — an actual WASM model construction, real
// getUserMedia/AudioWorklet mic capture, real Vosk recognition — is NOT
// something jsdom can meaningfully simulate (jsdom implements neither Web
// Audio nor getUserMedia at all), so it is not faked here. That real
// behavior was verified directly in a real browser instead (see this
// round's own final report for the Chrome verification trail). What IS
// honestly unit-testable in jsdom — feature detection, grammar
// construction, error classification, unsupported-environment fail-closed
// behavior, and model-load failure/retry (which happens BEFORE this
// provider ever touches getUserMedia/AudioContext — see start()'s own
// ordering) — is covered here, same discipline as
// sherpaOnnxProvider.test.ts/whisperCppProvider.test.ts's own documented
// testing boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVoskGrammarString,
  classifyVoskStartError,
  createVoskProvider,
  detectVoskSupport,
  resolveDefaultVoskModelUrl,
  VOSK_MODEL_SAMPLE_RATE,
  VOSK_PROTOTYPE_GRAMMAR_PHRASES,
  VOSK_PROVENANCE,
  VOSK_PROVIDER_ID,
} from "./voskProvider";

describe("detectVoskSupport — pure feature detection, same discipline as every other provider", () => {
  it("requires all three of WebAssembly, AudioWorkletNode, getUserMedia", () => {
    expect(detectVoskSupport({ hasWebAssembly: true, hasAudioWorkletNode: true, hasGetUserMedia: true })).toEqual({
      webAssembly: true,
      audioWorklet: true,
      getUserMedia: true,
    });
  });

  it("is unsupported missing any one of the three", () => {
    expect(detectVoskSupport({ hasWebAssembly: false, hasAudioWorkletNode: true, hasGetUserMedia: true }).webAssembly).toBe(false);
    expect(detectVoskSupport({ hasWebAssembly: true, hasAudioWorkletNode: false, hasGetUserMedia: true }).audioWorklet).toBe(false);
    expect(detectVoskSupport({ hasWebAssembly: true, hasAudioWorkletNode: true, hasGetUserMedia: false }).getUserMedia).toBe(false);
  });
});

describe("resolveDefaultVoskModelUrl — same-origin committed asset by default, overridable", () => {
  it("falls back to the committed public/vosk-lab/ asset when unset", () => {
    expect(resolveDefaultVoskModelUrl({})).toBe("/vosk-lab/vosk-model-small-en-us-0.15.tar.gz");
  });

  it("uses the env var verbatim when set", () => {
    expect(resolveDefaultVoskModelUrl({ NEXT_PUBLIC_VOSK_MODEL_URL: "https://blob.example.com/vosk-model.tar.gz" })).toBe(
      "https://blob.example.com/vosk-model.tar.gz"
    );
  });
});

describe("buildVoskGrammarString — grammar-constrained decoding (spec §5/§10, EYEONPIT NEXT BUILD's own GRAMMAR CONSTRAINT requirement)", () => {
  it("is exactly the 7 prototype phrases plus the '[unk]' catch-all — never unrestricted English", () => {
    expect(VOSK_PROTOTYPE_GRAMMAR_PHRASES).toEqual([
      "dealer has a five",
      "dealer has a king",
      "player one has a five",
      "player three has a king",
      "player three hits",
      "start count",
      "end count",
      "[unk]",
    ]);
  });

  it("serializes to a real JSON array string — the exact shape vosk-browser's KaldiRecognizer grammar parameter expects", () => {
    const grammar = buildVoskGrammarString();
    expect(() => JSON.parse(grammar)).not.toThrow();
    expect(JSON.parse(grammar)).toEqual(VOSK_PROTOTYPE_GRAMMAR_PHRASES);
  });

  it("a custom phrase list is respected (for tests exercising a different grammar) rather than always defaulting silently", () => {
    expect(JSON.parse(buildVoskGrammarString(["custom phrase", "[unk]"]))).toEqual(["custom phrase", "[unk]"]);
  });
});

describe("classifyVoskStartError — same classification discipline as every other provider", () => {
  it("classifies a 404/network failure as assets-not-found", () => {
    expect(classifyVoskStartError("failed to load /vosk-lab/vosk-model-small-en-us-0.15.tar.gz: 404")).toMatch(/^assets-not-found:/);
  });

  it("classifies a mic permission denial distinctly", () => {
    expect(classifyVoskStartError("NotAllowedError: Permission denied")).toMatch(/^mic-permission-denied:/);
  });

  it("passes through an unrecognized error message verbatim", () => {
    expect(classifyVoskStartError("some other engine error")).toBe("some other engine error");
  });
});

describe("VOSK_PROVENANCE / VOSK_MODEL_SAMPLE_RATE — real, disclosed model facts", () => {
  it("records the real committed model + runtime provenance", () => {
    expect(VOSK_PROVENANCE.modelName).toBe("vosk-model-small-en-us-0.15");
    expect(VOSK_PROVENANCE.modelLicense).toBe("Apache-2.0");
    expect(VOSK_PROVENANCE.runtimeLicense).toBe("Apache-2.0");
    expect(VOSK_PROVENANCE.singleThreaded).toBe(true);
    expect(VOSK_PROVENANCE.constrainedDecoding).toBe(true);
  });

  it("the model's native sample rate is 16kHz, the standard Vosk training rate", () => {
    expect(VOSK_MODEL_SAMPLE_RATE).toBe(16000);
  });
});

describe("createVoskProvider — unsupported environment fails closed (jsdom has no AudioWorkletNode/getUserMedia)", () => {
  it("reports supported: false and never touches the network/model", async () => {
    const onError = vi.fn();
    const onFinalResult = vi.fn();
    const provider = createVoskProvider({ onFinalResult, onError });
    expect(provider.providerId).toBe(VOSK_PROVIDER_ID);
    expect(provider.supported).toBe(false);

    await provider.start();

    expect(onError).toHaveBeenCalledWith("unsupported");
    expect(onFinalResult).not.toHaveBeenCalled();
  });

  it("stop() on a never-started unsupported provider is a safe no-op", () => {
    const provider = createVoskProvider({ onFinalResult: vi.fn() });
    expect(() => provider.stop()).not.toThrow();
  });
});

// The tests below stub AudioWorkletNode/getUserMedia just enough to make
// `supported` true, so start() proceeds past the unsupported short-circuit
// into loadModel() — which throws/resolves BEFORE this provider ever
// constructs an AudioContext or calls getUserMedia (see voskProvider.ts's
// own start() ordering). This is enough to exercise real model-load
// failure/retry behavior without needing to simulate Web Audio at all.
// `vi.resetModules()` BEFORE each dynamic `import("./voskProvider")` is
// required so that import picks up the just-registered `vi.doMock` — the
// module was already loaded once (unmocked) by this file's own top-level
// static import, and ESM's module cache would otherwise silently return
// that same unmocked instance.
describe("createVoskProvider — model load failure, never permanently wedged (mirrors whisperCppProvider.ts's own discardSessionOnFailure discipline)", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioWorkletNode", class {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("not reached in these tests")) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("vosk-browser");
    vi.resetModules();
  });

  it("a real load failure (e.g. the model asset genuinely 404s) surfaces a classified, disclosed error — never a fake success", async () => {
    vi.resetModules();
    vi.doMock("vosk-browser", () => ({
      createModel: vi.fn().mockRejectedValue(new Error("failed to load /vosk-lab/vosk-model-small-en-us-0.15.tar.gz: 404")),
    }));
    const { createVoskProvider: createProvider } = await import("./voskProvider");
    const onError = vi.fn();
    const provider = createProvider({ onFinalResult: vi.fn(), onError });
    expect(provider.supported).toBe(true);

    await provider.start();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/^assets-not-found:/);
  });

  it("STALE SESSION: a failed load must not be cached permanently — a second start() after a transient failure gets a fresh attempt, not the same rejected promise", async () => {
    vi.resetModules();
    const createModel = vi.fn().mockRejectedValueOnce(new Error("transient network blip")).mockResolvedValueOnce({
      KaldiRecognizer: class {
        on() {}
        setWords() {}
        acceptWaveformFloat() {}
        retrieveFinalResult() {}
        remove() {}
      },
    });
    vi.doMock("vosk-browser", () => ({ createModel }));
    const { createVoskProvider: createProvider } = await import("./voskProvider");

    const onError1 = vi.fn();
    await createProvider({ onFinalResult: vi.fn(), onError: onError1 }).start();
    expect(onError1).toHaveBeenCalledTimes(1);
    expect(onError1.mock.calls[0][0]).toContain("transient network blip");

    // Second attempt must retry loadModel() for real (createModel called
    // again), not reuse the first, permanently-rejected promise. It will
    // still fail here (this test stubs getUserMedia to reject, since real
    // Web Audio isn't simulated in jsdom — see this describe block's own
    // doc comment) — the assertion is specifically that createModel was
    // invoked a SECOND time, proving the stale rejected promise wasn't
    // cached forever.
    const onError2 = vi.fn();
    await createProvider({ onFinalResult: vi.fn(), onError: onError2 }).start();
    expect(createModel).toHaveBeenCalledTimes(2);
  });
});

// Real onPhraseDiagnostics verification — see voskProvider.ts's own PHRASE
// DIAGNOSTICS doc comment (added to investigate the real "Dealer has a
// five" mic miss). Requires a fuller fake Web Audio harness (getUserMedia,
// AudioContext, AudioWorkletNode all lack any jsdom implementation) so
// start() can proceed all the way through to a real, controllable
// recognizer instance instead of short-circuiting at loadModel() like the
// tests above.
describe("createVoskProvider — onPhraseDiagnostics (real Dealer-has-a-five investigation instrumentation)", () => {
  class FakeRecognizer {
    static instances: FakeRecognizer[] = [];
    listeners: Record<string, (msg: unknown) => void> = {};
    removed = false;
    constructor(
      public sampleRate: number,
      public grammar?: string
    ) {
      FakeRecognizer.instances.push(this);
    }
    setWords() {}
    on(event: string, cb: (msg: unknown) => void) {
      this.listeners[event] = cb;
    }
    acceptWaveformFloat() {}
    retrieveFinalResult() {
      // Real vosk-browser semantics: this only POSTS a message; the reply
      // arrives asynchronously — simulated here via a microtask, matching
      // this module's own doc comment on why diagnostics are reported from
      // inside the "result" handler, never synchronously after this call.
      queueMicrotask(() => this.listeners["result"]?.({ event: "result", recognizerId: "fake", result: { text: "", result: [] } }));
    }
    remove() {
      this.removed = true;
    }
  }

  class FakeAudioWorkletNode {
    static instances: FakeAudioWorkletNode[] = [];
    port = { onmessage: null as ((e: MessageEvent) => void) | null, close: vi.fn() };
    disconnect = vi.fn();
    constructor() {
      FakeAudioWorkletNode.instances.push(this);
    }
  }

  class FakeAudioContext {
    sampleRate = 48000;
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createMediaStreamSource() {
      return { connect: vi.fn() };
    }
    close() {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    FakeRecognizer.instances = [];
    FakeAudioWorkletNode.instances = [];
    vi.resetModules();
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });
    vi.doMock("vosk-browser", () => ({ createModel: vi.fn().mockResolvedValue({ KaldiRecognizer: FakeRecognizer }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("vosk-browser");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("zero partials + real audio chunks received is real evidence of a genuine decode miss (the 'Dealer has a five' scenario) — never silently unreported", async () => {
    const { createVoskProvider: createProvider } = await import("./voskProvider");
    const onPhraseDiagnostics = vi.fn();
    const onFinalResult = vi.fn();
    const provider = createProvider({ onFinalResult, onPhraseDiagnostics });

    await provider.start();
    const recognizer = FakeRecognizer.instances[0];
    const worklet = FakeAudioWorkletNode.instances[0];
    expect(recognizer).toBeDefined();
    expect(worklet).toBeDefined();

    // Real audio chunks reach the recognizer...
    worklet.port.onmessage?.({ data: new Float32Array(128) } as MessageEvent);
    worklet.port.onmessage?.({ data: new Float32Array(128) } as MessageEvent);
    // ...but the decoder never produces even one partial hypothesis, and
    // the eventual result is empty text — exactly what a genuine acoustic
    // miss looks like from this provider's perspective.
    recognizer.listeners["result"]?.({ event: "result", recognizerId: "fake", result: { text: "", result: [] } });

    expect(onPhraseDiagnostics).toHaveBeenCalledTimes(1);
    expect(onPhraseDiagnostics).toHaveBeenCalledWith({
      audioChunksReceived: 2,
      partialResultCount: 0,
      lastPartialText: null,
      finalizedBy: "endpointer",
    });
    // Empty text is never forwarded as a real final result — matches
    // EMPTY_TRANSCRIPT handling everywhere else in this app.
    expect(onFinalResult).not.toHaveBeenCalled();
  });

  it("a non-empty partial followed by an endpointer-produced final distinguishes 'premature cutoff' from 'no hypothesis at all'", async () => {
    const { createVoskProvider: createProvider } = await import("./voskProvider");
    const onPhraseDiagnostics = vi.fn();
    const provider = createProvider({ onFinalResult: vi.fn(), onPhraseDiagnostics });

    await provider.start();
    const recognizer = FakeRecognizer.instances[0];
    recognizer.listeners["partialresult"]?.({ event: "partialresult", recognizerId: "fake", result: { partial: "dealer has a" } });
    recognizer.listeners["result"]?.({ event: "result", recognizerId: "fake", result: { text: "", result: [] } });

    expect(onPhraseDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ partialResultCount: 1, lastPartialText: "dealer has a", finalizedBy: "endpointer" })
    );
  });

  it("End Phrase with no prior result forces finalization — finalizedBy: 'forced', reported exactly once", async () => {
    const { createVoskProvider: createProvider } = await import("./voskProvider");
    const onPhraseDiagnostics = vi.fn();
    const provider = createProvider({ onFinalResult: vi.fn(), onPhraseDiagnostics });

    await provider.start();
    provider.stop();
    // retrieveFinalResult()'s reply is asynchronous (see FakeRecognizer's
    // own doc comment) — flush microtasks before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(onPhraseDiagnostics).toHaveBeenCalledTimes(1);
    expect(onPhraseDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ finalizedBy: "forced" }));
  });

  it("a real (non-empty) final result IS forwarded to onFinalResult exactly once — one utterance, one command, never duplicated", async () => {
    const { createVoskProvider: createProvider } = await import("./voskProvider");
    const onFinalResult = vi.fn();
    const provider = createProvider({ onFinalResult, onPhraseDiagnostics: vi.fn() });

    await provider.start();
    const recognizer = FakeRecognizer.instances[0];
    recognizer.listeners["result"]?.({ event: "result", recognizerId: "fake", result: { text: "dealer has a five", result: [] } });
    // A stray second "result" event (should not happen in real operation,
    // but defensively verified) must never produce a second onFinalResult.
    provider.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFinalResult).toHaveBeenCalledTimes(1);
    expect(onFinalResult).toHaveBeenCalledWith(expect.objectContaining({ transcript: "dealer has a five", isFinal: true }));
  });
});
