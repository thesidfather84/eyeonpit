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
  buildHotwordsFileContent,
  detectSherpaOnnxSupport,
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

  it("stop()/suppressForSpeech()/resumeAfterSpeech() are safe no-ops before start() — never throw, never call a handler", () => {
    const onFinalResult = vi.fn();
    const onError = vi.fn();
    const provider = createSherpaOnnxProvider({ onFinalResult, onError });

    expect(() => {
      provider.stop();
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
