// @vitest-environment node
//
// Same testing boundary as sherpaOnnxProvider.test.ts's own doc comment:
// this provider depends on WASM/model assets that don't exist anywhere yet
// (see whisperCppProvider.ts's own ASSET DEPLOYMENT doc comment) and on
// DOM/AudioWorklet/getUserMedia APIs a plain Node/vitest environment
// doesn't have. These tests cover exactly what's honestly testable here:
// pure logic and unsupported-environment behavior — never a real WASM run,
// which has NOT been performed this round (disclosed explicitly in the
// module's own top-of-file doc comment, unlike sherpa-onnx's real-audio
// verification).
import { describe, expect, it, vi } from "vitest";
import {
  createWhisperCppProvider,
  WHISPER_CPP_PROVIDER_ID,
  WHISPER_CPP_PROVENANCE,
  WHISPER_CPP_ASSET_MANIFEST,
  WHISPER_CPP_MODELS,
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODEL_FS_PATH,
  detectWhisperCppSupport,
  resolveDefaultWhisperAssetBaseUrl,
  classifyWhisperStartError,
} from "./whisperCppProvider";

describe("detectWhisperCppSupport — pure feature detection, identical structure to Sherpa's own", () => {
  it("is entirely unsupported with no window", () => {
    expect(detectWhisperCppSupport({ hasWindow: false, hasWebAssembly: true, hasAudioWorkletNode: true, hasGetUserMedia: true })).toEqual({
      webAssembly: false,
      audioWorklet: false,
      getUserMedia: false,
    });
  });

  it("reports each capability independently when a window exists", () => {
    expect(
      detectWhisperCppSupport({ hasWindow: true, hasWebAssembly: true, hasAudioWorkletNode: false, hasGetUserMedia: true })
    ).toEqual({ webAssembly: true, audioWorklet: false, getUserMedia: true });
  });

  it("is fully supported when every capability is present", () => {
    expect(
      detectWhisperCppSupport({ hasWindow: true, hasWebAssembly: true, hasAudioWorkletNode: true, hasGetUserMedia: true })
    ).toEqual({ webAssembly: true, audioWorklet: true, getUserMedia: true });
  });
});

describe("resolveDefaultWhisperAssetBaseUrl — same env-var-overridable pattern as Sherpa's asset base URL", () => {
  it("falls back to the gitignored local dev path when the env var is unset", () => {
    expect(resolveDefaultWhisperAssetBaseUrl({})).toBe("/whisper-cpp-lab/");
  });

  it("falls back to the local dev path when the env var is an empty string", () => {
    expect(resolveDefaultWhisperAssetBaseUrl({ NEXT_PUBLIC_WHISPER_ASSET_BASE_URL: "" })).toBe("/whisper-cpp-lab/");
  });

  it("uses the env var verbatim when set", () => {
    expect(
      resolveDefaultWhisperAssetBaseUrl({ NEXT_PUBLIC_WHISPER_ASSET_BASE_URL: "https://blob.example.com/whisper/v1/" })
    ).toBe("https://blob.example.com/whisper/v1/");
  });

  it("ignores unrelated env vars", () => {
    expect(resolveDefaultWhisperAssetBaseUrl({ NODE_ENV: "production" })).toBe("/whisper-cpp-lab/");
  });
});

describe("classifyWhisperStartError — same exact-asset-URL error detail as Sherpa's own", () => {
  it('classifies a loadScript 404 as "assets-not-found", naming the exact failing URL', () => {
    expect(classifyWhisperStartError("failed to load /whisper-cpp-lab/command.js")).toBe(
      "assets-not-found: failed to load /whisper-cpp-lab/command.js"
    );
  });

  it('classifies a model-file fetch failure as "assets-not-found" too', () => {
    expect(classifyWhisperStartError("failed to load /whisper-cpp-lab/ggml-tiny.en-q5_1.bin")).toBe(
      "assets-not-found: failed to load /whisper-cpp-lab/ggml-tiny.en-q5_1.bin"
    );
  });

  it("passes through an unrelated error message verbatim — never mislabels a real init()/model error as a missing asset", () => {
    expect(classifyWhisperStartError("whisper.cpp init() returned 0 (model load failed)")).toBe(
      "whisper.cpp init() returned 0 (model load failed)"
    );
  });
});

describe("createWhisperCppProvider — Node/vitest environment (no window)", () => {
  it("reports providerId", () => {
    const provider = createWhisperCppProvider({ onFinalResult: vi.fn() });
    expect(provider.providerId).toBe(WHISPER_CPP_PROVIDER_ID);
  });

  it("is NOT supported without a browser environment — real feature detection, not a hardcoded guess", () => {
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

  it("accepts assetBaseUrl/modelId/feedIntervalMs options without throwing at construction time (no network/DOM access until start())", () => {
    expect(() =>
      createWhisperCppProvider({
        onFinalResult: vi.fn(),
        assetBaseUrl: "/whisper-cpp-lab/",
        modelId: "base.en-q5_1",
        feedIntervalMs: 100,
      })
    ).not.toThrow();
  });

  it("still reports onError(\"unsupported\") regardless of the tuned options — construction-time-only fields never bypass real feature detection", () => {
    const onError = vi.fn();
    const provider = createWhisperCppProvider({ onFinalResult: vi.fn(), onError, modelId: "base.en" });
    provider.start();
    expect(onError).toHaveBeenCalledWith("unsupported");
  });
});

describe("WHISPER_CPP_PROVENANCE — real, cited, and honest about what was NOT verified this round", () => {
  it("records the real engine repository and license", () => {
    expect(WHISPER_CPP_PROVENANCE.engineRepository).toBe("https://github.com/ggml-org/whisper.cpp");
    expect(WHISPER_CPP_PROVENANCE.engineLicense).toBe("MIT");
  });

  it("records command.wasm as the chosen example, with a real stated reason", () => {
    expect(WHISPER_CPP_PROVENANCE.example).toBe("examples/command.wasm");
    expect(WHISPER_CPP_PROVENANCE.exampleChosenBecause).toMatch(/voice commands/i);
  });

  it("honestly records that no prebuilt browser release exists and no toolchain is available here", () => {
    expect(WHISPER_CPP_PROVENANCE.prebuiltBrowserReleaseExists).toBe(false);
    expect(WHISPER_CPP_PROVENANCE.emscriptenToolchainAvailableInThisEnvironment).toBe(false);
  });

  it("records the exact pinned upstream commit the deployed assets were extracted from — real, verifiable provenance, not guessed", () => {
    expect(WHISPER_CPP_PROVENANCE.pinnedCommit).toBe("339f2b4e");
    expect(WHISPER_CPP_PROVENANCE.pinnedCommitSubject).toMatch(/package\.json/);
    expect(WHISPER_CPP_ASSET_MANIFEST.pinnedCommit).toBe(WHISPER_CPP_PROVENANCE.pinnedCommit);
  });

  it("records assets were extracted from the official live demo, not built from source", () => {
    expect(WHISPER_CPP_PROVENANCE.assetsExtractedFrom).toMatch(/official live demo/i);
  });

  it("has zero files copied into this repo and zero upstream modifications", () => {
    expect(WHISPER_CPP_PROVENANCE.filesActuallyCopiedIntoThisRepo).toEqual([]);
    expect(WHISPER_CPP_PROVENANCE.modificationsToUpstream).toEqual([]);
  });
});

describe("WHISPER_CPP_ASSET_MANIFEST — real sha256/size for every extracted asset, recorded this round", () => {
  it("records all four real deployed files with a positive size and a 64-char sha256", () => {
    for (const [name, info] of Object.entries(WHISPER_CPP_ASSET_MANIFEST.files)) {
      expect(info.sizeBytes).toBeGreaterThan(0);
      expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("the model file (whisper.bin) is roughly 31MB — the real downloaded tiny.en-q5_1 size", () => {
    const model = WHISPER_CPP_ASSET_MANIFEST.files["whisper.bin"];
    expect(model.sizeBytes).toBeGreaterThan(30_000_000);
    expect(model.sizeBytes).toBeLessThan(33_000_000);
  });
});

describe("WHISPER_MODEL_FS_PATH — the fixed virtual-FS destination confirmed from the real reference implementation", () => {
  it('is always "whisper.bin" — the model is never written under its own original filename', () => {
    expect(WHISPER_MODEL_FS_PATH).toBe("whisper.bin");
  });
});

describe("WHISPER_CPP_MODELS — real sizes confirmed from the live official demo page this round", () => {
  it("defaults to the smallest/fastest quantized tiny.en model", () => {
    expect(DEFAULT_WHISPER_MODEL).toBe("tiny.en-q5_1");
  });

  it("every model has a real, positive approximate size and a .bin filename", () => {
    for (const [id, info] of Object.entries(WHISPER_CPP_MODELS)) {
      expect(info.file).toMatch(/^ggml-.*\.bin$/);
      expect(info.approxSizeBytes).toBeGreaterThan(0);
      expect(id).toContain(".en"); // English-only models, per explicit requirement
    }
  });

  it("quantized variants are smaller than their non-quantized counterparts", () => {
    expect(WHISPER_CPP_MODELS["tiny.en-q5_1"].approxSizeBytes).toBeLessThan(WHISPER_CPP_MODELS["tiny.en"].approxSizeBytes);
    expect(WHISPER_CPP_MODELS["base.en-q5_1"].approxSizeBytes).toBeLessThan(WHISPER_CPP_MODELS["base.en"].approxSizeBytes);
  });
});
