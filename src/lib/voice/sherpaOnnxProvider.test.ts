// @vitest-environment node
//
// SherpaOnnxProvider is now real, working code (see its own top-of-file
// VERIFICATION doc comment for exactly what was independently confirmed
// running against real audio this round) — but it depends on ~205MB of
// WASM/model assets this repo deliberately does not ship (see ASSET
// DEPLOYMENT in that file), and on DOM/AudioWorklet/getUserMedia APIs a
// plain Node/vitest environment doesn't have. These tests therefore cover
// exactly what's honestly testable here: the PURE logic (hotwords-file
// construction, feature detection, provenance data) and the provider's
// behavior when the browser environment or the asset bundle is absent —
// never a real WASM run, which was verified separately, by hand, in a
// real Chrome tab (see docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md).
import { describe, expect, it, vi } from "vitest";
import {
  createSherpaOnnxProvider,
  SHERPA_ONNX_PROVIDER_ID,
  SHERPA_ONNX_PROVENANCE,
  SHERPA_ONNX_REAL_AUDIO_VERIFICATION,
  SHERPA_HOTWORDS_DECODING_METHOD,
  SHERPA_HOTWORDS_SCORE,
  SHERPA_DEALER_HOTWORD_INVESTIGATION,
  buildHotwordsFileContent,
  detectSherpaOnnxSupport,
  resolveDefaultAssetBaseUrl,
  classifySherpaStartError,
  finalizeSherpaStream,
} from "./sherpaOnnxProvider";
import type { HotwordEntry } from "./casinoVoiceContext";

describe("buildHotwordsFileContent — pure, no WASM/DOM", () => {
  it("emits one phrase per line", () => {
    const hotwords: HotwordEntry[] = [
      { phrase: "dealer", weight: 10, reason: "test" },
      { phrase: "spot", weight: 9, reason: "test" },
    ];
    expect(buildHotwordsFileContent(hotwords)).toBe("dealer\nspot\n");
  });

  it("returns an empty string for an empty hotword list", () => {
    expect(buildHotwordsFileContent([])).toBe("");
  });

  it("ignores weight/reason — only phrase text goes into the file (the JS API has no per-line score field)", () => {
    const hotwords: HotwordEntry[] = [{ phrase: "ace", weight: 1, reason: "irrelevant" }];
    const content = buildHotwordsFileContent(hotwords);
    expect(content).not.toContain("irrelevant");
    expect(content).not.toContain("1");
    expect(content).toBe("ace\n");
  });

  it('defaults to "as-is" casing — exact prior-round behavior, unchanged unless explicitly opted in', () => {
    const hotwords: HotwordEntry[] = [{ phrase: "dealer", weight: 10, reason: "test" }];
    expect(buildHotwordsFileContent(hotwords)).toBe("dealer\n");
    expect(buildHotwordsFileContent(hotwords, "as-is")).toBe("dealer\n");
  });

  it('uppercases every phrase when casing is "upper" — the CONFIRMED correct setting for this model', () => {
    const hotwords: HotwordEntry[] = [
      { phrase: "dealer", weight: 10, reason: "test" },
      { phrase: "player", weight: 9, reason: "test" },
    ];
    expect(buildHotwordsFileContent(hotwords, "upper")).toBe("DEALER\nPLAYER\n");
  });
});

describe("detectSherpaOnnxSupport — pure feature detection", () => {
  it("is entirely unsupported with no window", () => {
    expect(detectSherpaOnnxSupport({ hasWindow: false, hasWebAssembly: true, hasAudioWorkletNode: true, hasGetUserMedia: true })).toEqual({
      webAssembly: false,
      audioWorklet: false,
      getUserMedia: false,
    });
  });

  it("reports each capability independently when a window exists", () => {
    expect(
      detectSherpaOnnxSupport({ hasWindow: true, hasWebAssembly: true, hasAudioWorkletNode: false, hasGetUserMedia: true })
    ).toEqual({ webAssembly: true, audioWorklet: false, getUserMedia: true });
  });

  it("is fully supported when every capability is present", () => {
    expect(
      detectSherpaOnnxSupport({ hasWindow: true, hasWebAssembly: true, hasAudioWorkletNode: true, hasGetUserMedia: true })
    ).toEqual({ webAssembly: true, audioWorklet: true, getUserMedia: true });
  });
});

describe("resolveDefaultAssetBaseUrl — the 2026-08-20 \"assets-not-found\" production-incident fix", () => {
  it("falls back to the gitignored local dev path when the env var is unset — byte-for-byte the prior hardcoded default", () => {
    expect(resolveDefaultAssetBaseUrl({})).toBe("/sherpa-onnx-lab/");
  });

  it("falls back to the local dev path when the env var is an empty string", () => {
    expect(resolveDefaultAssetBaseUrl({ NEXT_PUBLIC_SHERPA_ASSET_BASE_URL: "" })).toBe("/sherpa-onnx-lab/");
  });

  it("uses the env var verbatim when set — lets a real deployment point at externally-hosted assets with zero code change", () => {
    expect(resolveDefaultAssetBaseUrl({ NEXT_PUBLIC_SHERPA_ASSET_BASE_URL: "https://blob.example.com/sherpa/v1.13.6/" })).toBe(
      "https://blob.example.com/sherpa/v1.13.6/"
    );
  });

  it("ignores unrelated env vars", () => {
    expect(resolveDefaultAssetBaseUrl({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe("/sherpa-onnx-lab/");
  });
});

describe("classifySherpaStartError — the exact-asset-URL error detail fix", () => {
  it('classifies a loadScript 404 as "assets-not-found", naming the exact failing URL', () => {
    const result = classifySherpaStartError("failed to load /sherpa-onnx-lab/sherpa-onnx-asr.js");
    expect(result).toBe("assets-not-found: failed to load /sherpa-onnx-lab/sherpa-onnx-asr.js");
  });

  it('classifies a bpe.vocab fetch failure as "assets-not-found", naming that exact URL too', () => {
    const result = classifySherpaStartError("failed to load /sherpa-onnx-lab/bpe.vocab");
    expect(result).toBe("assets-not-found: failed to load /sherpa-onnx-lab/bpe.vocab");
  });

  it("classifies a bare 404-mentioning message the same way", () => {
    expect(classifySherpaStartError("Request failed with status 404")).toMatch(/^assets-not-found: /);
  });

  it("passes through an unrelated error message verbatim — never mislabels a real WASM/recognizer error as a missing asset", () => {
    expect(classifySherpaStartError("createOnlineRecognizer missing after module init")).toBe(
      "createOnlineRecognizer missing after module init"
    );
  });

  it("is case-insensitive on the 404/failed-to-load match", () => {
    expect(classifySherpaStartError("FAILED TO LOAD /sherpa-onnx-lab/sherpa-onnx-wasm-main-asr.wasm")).toMatch(
      /^assets-not-found: /
    );
  });
});

describe("createSherpaOnnxProvider — Node/vitest environment (no window)", () => {
  it("reports providerId", () => {
    const provider = createSherpaOnnxProvider({ onFinalResult: vi.fn() });
    expect(provider.providerId).toBe(SHERPA_ONNX_PROVIDER_ID);
  });

  it("is NOT supported without a browser environment — real feature detection, not a hardcoded guess", () => {
    const provider = createSherpaOnnxProvider({ onFinalResult: vi.fn() });
    expect(provider.supported).toBe(false);
  });

  it("start() reports onError(\"unsupported\") and touches no other handler when unsupported", () => {
    const onFinalResult = vi.fn();
    const onInterimResult = vi.fn();
    const onError = vi.fn();
    const provider = createSherpaOnnxProvider({ onFinalResult, onInterimResult, onError });

    provider.start();

    expect(onError).toHaveBeenCalledWith("unsupported");
    expect(onFinalResult).not.toHaveBeenCalled();
    expect(onInterimResult).not.toHaveBeenCalled();
  });

  it("stop()/suppressForSpeech()/resumeAfterSpeech() are safe no-ops before start() — never throw (stop() is now async, see the FINALIZATION DRAIN fix), never call a handler", async () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const provider = createSherpaOnnxProvider({ onFinalResult, onError });

    await expect(provider.stop()).resolves.toBeUndefined();
    expect(() => {
      provider.suppressForSpeech();
      provider.resumeAfterSpeech();
    }).not.toThrow();
    expect(onFinalResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("accepts assetBaseUrl and hotwords options without throwing at construction time (no network/DOM access until start())", () => {
    expect(() =>
      createSherpaOnnxProvider({
        onFinalResult: vi.fn(),
        assetBaseUrl: "/sherpa-onnx-lab/",
        hotwords: [{ phrase: "dealer", weight: 10, reason: "casino vocabulary" }],
      })
    ).not.toThrow();
  });

  it("accepts modelingUnit/bpeVocabUrl/hotwordCasing (the Dealer-investigation fix) without throwing at construction time", () => {
    expect(() =>
      createSherpaOnnxProvider({
        onFinalResult: vi.fn(),
        assetBaseUrl: "/sherpa-onnx-lab/",
        hotwords: [{ phrase: "dealer", weight: 10, reason: "casino vocabulary" }],
        modelingUnit: "bpe",
        bpeVocabUrl: "/sherpa-onnx-lab/bpe.vocab",
        hotwordCasing: "upper",
      })
    ).not.toThrow();
  });

  it("still reports onError(\"unsupported\") with the tuned options — construction-time-only fields never bypass real feature detection", () => {
    const onError = vi.fn();
    const provider = createSherpaOnnxProvider({
      onFinalResult: vi.fn(),
      onError,
      modelingUnit: "bpe",
      bpeVocabUrl: "/sherpa-onnx-lab/bpe.vocab",
      hotwordCasing: "upper",
    });
    provider.start();
    expect(onError).toHaveBeenCalledWith("unsupported");
  });
});

describe("SHERPA_ONNX_PROVENANCE — real, cited, corrected this round", () => {
  it("records the verified engine version and license", () => {
    expect(SHERPA_ONNX_PROVENANCE.engineRepository).toBe("https://github.com/k2-fsa/sherpa-onnx");
    expect(SHERPA_ONNX_PROVENANCE.engineVersion).toBe("1.13.6");
    expect(SHERPA_ONNX_PROVENANCE.engineLicense).toBe("Apache-2.0");
  });

  it("records the model actually bundled in the official WASM release — corrected from the prior scaffold's guess", () => {
    expect(SHERPA_ONNX_PROVENANCE.bundledModel).toBe("sherpa-onnx-streaming-zipformer-en-2023-06-21");
    expect(SHERPA_ONNX_PROVENANCE.bundledModelLicense).toBe("Apache-2.0");
  });

  it("has zero files copied into this repo and zero upstream modifications — the WASM/model assets are deployed separately, never committed", () => {
    expect(SHERPA_ONNX_PROVENANCE.filesActuallyCopiedIntoThisRepo).toEqual([]);
    expect(SHERPA_ONNX_PROVENANCE.modificationsToUpstream).toEqual([]);
  });
});

describe("SHERPA_ONNX_REAL_AUDIO_VERIFICATION — the real transcripts obtained this round", () => {
  it("both real test clips produced an exact word-for-word match against ground truth", () => {
    expect(SHERPA_ONNX_REAL_AUDIO_VERIFICATION.length).toBe(2);
    for (const entry of SHERPA_ONNX_REAL_AUDIO_VERIFICATION) {
      expect(entry.exactMatch).toBe(true);
      expect(entry.recognized).toBe(entry.groundTruth);
    }
  });
});

describe("hotwords decoding requirements — confirmed for real this round, not assumed from docs", () => {
  it("modified_beam_search is the decoding method hotwords require", () => {
    expect(SHERPA_HOTWORDS_DECODING_METHOD).toBe("modified_beam_search");
  });

  it("hotwords score is a positive, conservative constant", () => {
    expect(SHERPA_HOTWORDS_SCORE).toBeGreaterThan(0);
    expect(SHERPA_HOTWORDS_SCORE).toBeLessThan(10);
  });
});

describe("finalizeSherpaStream — the 2026-08-20 real-mic FINALIZATION TRUNCATION fix, pure/injected, no WASM/DOM", () => {
  it("REGRESSION (item 1): drains pending audio BEFORE reading the final result — a chunk delivered only during the drain is incorporated, fixing the real 'Dealer has a king' -> 'Dealer has a' truncation", async () => {
    let drained = false;
    const decodeCalls: string[] = [];
    const finalText = await finalizeSherpaStream({
      drainPendingAudio: async () => {
        // Simulates the audio-worklet message (containing "KING") that was
        // already captured but not yet delivered when stop() was called —
        // this is exactly the real race the investigation found.
        drained = true;
      },
      inputFinished: () => decodeCalls.push("inputFinished"),
      isReady: () => false,
      decode: () => decodeCalls.push("decode"),
      getResultText: () => (drained ? "DEALER HAS A KING" : "DEALER HAS A"),
    });
    expect(finalText).toBe("DEALER HAS A KING");
  });

  it("REGRESSION (item 2): when the final decode is genuinely better/longer than any prior interim, the real (later) text is what's used — this fix never freezes an earlier reading", async () => {
    const finalText = await finalizeSherpaStream({
      drainPendingAudio: async () => {},
      inputFinished: () => {},
      isReady: () => false,
      decode: () => {},
      getResultText: () => "PLAYER THREE HITS GETS A FOUR",
    });
    expect(finalText).toBe("PLAYER THREE HITS GETS A FOUR");
  });

  it("drains before calling inputFinished() — strict ordering, not just 'eventually called'", async () => {
    const order: string[] = [];
    await finalizeSherpaStream({
      drainPendingAudio: async () => {
        order.push("drain");
      },
      inputFinished: () => order.push("inputFinished"),
      isReady: () => false,
      decode: () => order.push("decode"),
      getResultText: () => "X",
    });
    expect(order).toEqual(["drain", "inputFinished"]);
  });

  it("decodes every ready chunk (loop, not a single decode) before reading the result", async () => {
    let readyCount = 3;
    const decodeCalls: number[] = [];
    await finalizeSherpaStream({
      drainPendingAudio: async () => {},
      inputFinished: () => {},
      isReady: () => readyCount > 0,
      decode: () => {
        decodeCalls.push(readyCount);
        readyCount -= 1;
      },
      getResultText: () => "X",
    });
    expect(decodeCalls).toEqual([3, 2, 1]);
  });

  it("never emits a final for empty decoded text — returns null, exactly like the pre-fix inline check", async () => {
    const finalText = await finalizeSherpaStream({
      drainPendingAudio: async () => {},
      inputFinished: () => {},
      isReady: () => false,
      decode: () => {},
      getResultText: () => "",
    });
    expect(finalText).toBeNull();
  });

  it("never inspects, compares, or falls back to interim text — it has no interim parameter at all, by construction; it only ever reads the real post-drain decode result", async () => {
    // There is no way to pass "the last interim" into this function — this
    // is the structural guarantee behind "do not simply promote arbitrary
    // interim text to final."
    const finalText = await finalizeSherpaStream({
      drainPendingAudio: async () => {},
      inputFinished: () => {},
      isReady: () => false,
      decode: () => {},
      getResultText: () => "WHATEVER THE REAL RECOGNIZER ACTUALLY DECODED",
    });
    expect(finalText).toBe("WHATEVER THE REAL RECOGNIZER ACTUALLY DECODED");
  });
});

describe("SHERPA_DEALER_HOTWORD_INVESTIGATION — the 2026-08-20 confirmed root-cause record", () => {
  it("records modelingUnit was shipped wrong and bpe is confirmed correct", () => {
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.modelingUnitWasWrong.shipped).toBe("cjkchar");
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.modelingUnitWasWrong.correct).toBe("bpe");
  });

  it("records the model bundle does NOT ship bpe.vocab, and cites a real, verified source for it", () => {
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.bpeVocabWasMissing.shippedInModelBundle).toBe(false);
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.bpeVocabWasMissing.realSourceFound).toBe(true);
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.bpeVocabWasMissing.source).toContain("bpe.model");
  });

  it("records hotword casing was shipped wrong (lowercase) and UPPERCASE is confirmed correct", () => {
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.hotwordCasingWasWrong.correct).toBe("UPPERCASE");
  });

  it("honestly records that real-mic accuracy improvement is still not measured", () => {
    expect(SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.stillNotMeasured).toMatch(/not been measured/i);
  });
});
