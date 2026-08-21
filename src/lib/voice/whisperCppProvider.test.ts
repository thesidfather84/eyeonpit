// @vitest-environment node
//
// This provider's real work — an actual iframe loading a real cross-origin
// runtime, real postMessage exchange, real getUserMedia/WASM inside that
// iframe — is NOT something jsdom can meaningfully simulate (jsdom does
// not navigate iframes to real URLs or implement getUserMedia/AudioWorklet
// at all), so it is not faked here. That real behavior was verified
// directly in a real browser instead — see this module's own top-of-file
// ARCHITECTURE and NO-WAKE-PHRASE PATCH doc comments for exactly what was
// proven (real transcription of jfk.wav on the isolated origin with zero
// wake phrase spoken) and the round's own final report for the full
// verification trail. What IS honestly unit-testable in a plain
// Node/vitest environment — pure protocol parsing/validation, origin
// trust logic, error classification, timeout behavior, and
// unsupported-environment behavior — is covered here, same discipline as
// sherpaOnnxProvider.test.ts's own documented testing boundary.
import { describe, expect, it, vi } from "vitest";
import {
  createWhisperCppProvider,
  WHISPER_CPP_PROVIDER_ID,
  WHISPER_CPP_PROVENANCE,
  DEFAULT_WHISPER_READY_TIMEOUT_MS,
  WHISPER_IFRAME_READY_TIMEOUT_MESSAGE,
  detectWhisperCppSupport,
  resolveDefaultWhisperOrigin,
  isTrustedWhisperMessageOrigin,
  parseWhisperInboundMessage,
  classifyWhisperStartError,
  withWhisperReadyTimeout,
} from "./whisperCppProvider";

describe("detectWhisperCppSupport — iframe embedding needs only window+document, unlike the old in-process WASM checks", () => {
  it("is unsupported with no window", () => {
    expect(detectWhisperCppSupport({ hasWindow: false, hasDocument: true })).toEqual({ iframeEmbedding: false });
  });

  it("is unsupported with no document", () => {
    expect(detectWhisperCppSupport({ hasWindow: true, hasDocument: false })).toEqual({ iframeEmbedding: false });
  });

  it("is supported with both", () => {
    expect(detectWhisperCppSupport({ hasWindow: true, hasDocument: true })).toEqual({ iframeEmbedding: true });
  });
});

describe("resolveDefaultWhisperOrigin — falls back to the real, deployed isolated origin, no env var required", () => {
  it("falls back to the real whisper-static-lab production origin when unset", () => {
    expect(resolveDefaultWhisperOrigin({})).toBe("https://whisper-static-lab.vercel.app");
  });

  it("falls back when the env var is an empty string", () => {
    expect(resolveDefaultWhisperOrigin({ NEXT_PUBLIC_WHISPER_STATIC_ORIGIN: "" })).toBe("https://whisper-static-lab.vercel.app");
  });

  it("uses the env var verbatim (minus any trailing slash) when set", () => {
    expect(resolveDefaultWhisperOrigin({ NEXT_PUBLIC_WHISPER_STATIC_ORIGIN: "https://whisper-lab.example.com/" })).toBe(
      "https://whisper-lab.example.com"
    );
  });

  it("ignores unrelated env vars", () => {
    expect(resolveDefaultWhisperOrigin({ NODE_ENV: "production" })).toBe("https://whisper-static-lab.vercel.app");
  });
});

describe("isTrustedWhisperMessageOrigin — the ONE real security boundary for inbound messages, per this module's SECURITY doc comment", () => {
  it("trusts an exact match", () => {
    expect(isTrustedWhisperMessageOrigin("https://whisper-static-lab.vercel.app", "https://whisper-static-lab.vercel.app")).toBe(true);
  });

  it("rejects a different origin outright", () => {
    expect(isTrustedWhisperMessageOrigin("https://evil.example.com", "https://whisper-static-lab.vercel.app")).toBe(false);
  });

  it("rejects a same-host-different-scheme origin — never treated as equivalent", () => {
    expect(isTrustedWhisperMessageOrigin("http://whisper-static-lab.vercel.app", "https://whisper-static-lab.vercel.app")).toBe(false);
  });

  it("rejects a subdomain that merely contains the configured origin as a substring", () => {
    expect(isTrustedWhisperMessageOrigin("https://whisper-static-lab.vercel.app.evil.com", "https://whisper-static-lab.vercel.app")).toBe(
      false
    );
  });

  it("rejects the literal wildcard string — never silently trusted", () => {
    expect(isTrustedWhisperMessageOrigin("*", "https://whisper-static-lab.vercel.app")).toBe(false);
  });
});

describe("parseWhisperInboundMessage — validates the narrow protocol; no audio/waveform shape exists to parse, by design", () => {
  it('rejects "whisper:ready" — deliberately not part of the protocol (see MESSAGE ORDERING doc comment: whisper:status "listening" is the real readiness signal, sent only as a reply)', () => {
    expect(parseWhisperInboundMessage({ type: "whisper:ready", moduleReadyMs: 670 })).toBeNull();
  });

  it("parses a valid whisper:error message", () => {
    expect(parseWhisperInboundMessage({ type: "whisper:error", message: "mic denied" })).toEqual({ type: "whisper:error", message: "mic denied" });
  });

  it("parses a valid whisper:final message", () => {
    expect(parseWhisperInboundMessage({ type: "whisper:final", text: "dealer has a king" })).toEqual({
      type: "whisper:final",
      text: "dealer has a king",
    });
  });

  it("parses a valid whisper:status message", () => {
    expect(parseWhisperInboundMessage({ type: "whisper:status", status: "listening" })).toEqual({ type: "whisper:status", status: "listening" });
  });

  it("rejects null/non-object data", () => {
    expect(parseWhisperInboundMessage(null)).toBeNull();
    expect(parseWhisperInboundMessage("whisper:status")).toBeNull();
    expect(parseWhisperInboundMessage(42)).toBeNull();
  });

  it("rejects an unknown type", () => {
    expect(parseWhisperInboundMessage({ type: "whisper:audio-chunk", samples: [1, 2, 3] })).toBeNull();
  });

  it("rejects a known type with a missing/mis-typed required field — never coerces", () => {
    expect(parseWhisperInboundMessage({ type: "whisper:status" })).toBeNull();
    expect(parseWhisperInboundMessage({ type: "whisper:error", message: 123 })).toBeNull();
    expect(parseWhisperInboundMessage({ type: "whisper:final" })).toBeNull();
  });

  it("never parses a message carrying raw audio/waveform data as a trusted shape, even if it claims a known type", () => {
    expect(parseWhisperInboundMessage({ type: "whisper:final", text: "ok", audio: new Float32Array([1, 2, 3]) })).toEqual({
      type: "whisper:final",
      text: "ok",
    });
  });
});

describe("classifyWhisperStartError", () => {
  it("classifies an iframe-unreachable network failure distinctly", () => {
    expect(classifyWhisperStartError("failed to load https://whisper-static-lab.vercel.app/")).toBe(
      "iframe-unreachable: failed to load https://whisper-static-lab.vercel.app/"
    );
  });

  it("passes the ready-timeout message through verbatim, never relabeled as network failure", () => {
    expect(classifyWhisperStartError(WHISPER_IFRAME_READY_TIMEOUT_MESSAGE)).toBe(WHISPER_IFRAME_READY_TIMEOUT_MESSAGE);
  });

  it("passes an unrelated real error through verbatim", () => {
    expect(classifyWhisperStartError("mic access denied by user")).toBe("mic access denied by user");
  });
});

describe("withWhisperReadyTimeout — bounds the wait for the iframe to confirm it started listening, mirrors the prior in-process provider's own hang-prevention fix", () => {
  it("resolves normally when the underlying promise resolves before the timeout", async () => {
    await expect(withWhisperReadyTimeout(Promise.resolve(670), DEFAULT_WHISPER_READY_TIMEOUT_MS)).resolves.toBe(670);
  });

  it("rejects with the real underlying error when the promise rejects before the timeout", async () => {
    await expect(withWhisperReadyTimeout(Promise.reject(new Error("mic denied")), DEFAULT_WHISPER_READY_TIMEOUT_MS)).rejects.toThrow(
      "mic denied"
    );
  });

  it("rejects with WHISPER_IFRAME_READY_TIMEOUT_MESSAGE when the promise never settles", async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = new Promise<number>(() => {});
      const result = withWhisperReadyTimeout(neverSettles, 20000);
      const assertion = expect(result).rejects.toThrow(WHISPER_IFRAME_READY_TIMEOUT_MESSAGE);
      await vi.advanceTimersByTimeAsync(20000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createWhisperCppProvider — Node/vitest environment (no window/document)", () => {
  it("reports providerId", () => {
    const provider = createWhisperCppProvider({ onFinalResult: vi.fn() });
    expect(provider.providerId).toBe(WHISPER_CPP_PROVIDER_ID);
  });

  it("is NOT supported without a browser environment", () => {
    const provider = createWhisperCppProvider({ onFinalResult: vi.fn() });
    expect(provider.supported).toBe(false);
  });

  it('start() reports onError("unsupported") and touches no other handler when unsupported', () => {
    const onFinalResult = vi.fn();
    const onInterimResult = vi.fn();
    const onError = vi.fn();
    const provider = createWhisperCppProvider({ onFinalResult, onInterimResult, onError });

    provider.start();

    expect(onError).toHaveBeenCalledWith("unsupported");
    expect(onFinalResult).not.toHaveBeenCalled();
    expect(onInterimResult).not.toHaveBeenCalled();
  });

  it("stop()/suppressForSpeech()/resumeAfterSpeech() are safe no-ops before start() — never throw, never call a handler", () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const provider = createWhisperCppProvider({ onFinalResult, onError });

    expect(() => {
      provider.stop();
      provider.suppressForSpeech();
      provider.resumeAfterSpeech();
    }).not.toThrow();
    expect(onFinalResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("accepts whisperOrigin/readyTimeoutMs options without throwing at construction time (no network/DOM access until start())", () => {
    expect(() =>
      createWhisperCppProvider({
        onFinalResult: vi.fn(),
        whisperOrigin: "https://whisper-static-lab.vercel.app",
        readyTimeoutMs: 5000,
      })
    ).not.toThrow();
  });

  it('still reports onError("unsupported") regardless of the tuned options — construction-time-only fields never bypass real feature detection', () => {
    const onError = vi.fn();
    const provider = createWhisperCppProvider({ onFinalResult: vi.fn(), onError, whisperOrigin: "https://example.com" });
    provider.start();
    expect(onError).toHaveBeenCalledWith("unsupported");
  });
});

describe("WHISPER_CPP_PROVENANCE — real, cited, and honest about architecture + the no-wake-phrase patch", () => {
  it("records the real engine repository and license", () => {
    expect(WHISPER_CPP_PROVENANCE.engineRepository).toBe("https://github.com/ggml-org/whisper.cpp");
    expect(WHISPER_CPP_PROVENANCE.engineLicense).toBe("MIT");
  });

  it("records command.wasm as the chosen example, with a real stated reason", () => {
    expect(WHISPER_CPP_PROVENANCE.example).toBe("examples/command.wasm");
    expect(WHISPER_CPP_PROVENANCE.exampleChosenBecause).toMatch(/voice commands/i);
  });

  it("records the isolated-static-origin-iframe architecture and why in-process WASM was abandoned", () => {
    expect(WHISPER_CPP_PROVENANCE.architecture).toBe("isolated-static-origin-iframe");
    expect(WHISPER_CPP_PROVENANCE.inProcessWasmConfirmedBroken).toMatch(/pthread/i);
  });

  it("records the exact pinned upstream commit the deployed/patched build is built from", () => {
    expect(WHISPER_CPP_PROVENANCE.pinnedCommit).toBe("339f2b4e");
    expect(WHISPER_CPP_PROVENANCE.pinnedCommitSubject).toMatch(/package\.json/);
  });

  it("records the no-wake-phrase patch and its real verified transcription result", () => {
    expect(WHISPER_CPP_PROVENANCE.noWakePhrasePatch.against).toBe("pinned commit 339f2b4e");
    expect(WHISPER_CPP_PROVENANCE.noWakePhrasePatch.verifiedRealTranscription).toMatch(/country/i);
  });

  it("has zero files copied into this repo — the WASM runtime lives entirely on the isolated origin", () => {
    expect(WHISPER_CPP_PROVENANCE.filesActuallyCopiedIntoThisRepo).toEqual([]);
  });
});
