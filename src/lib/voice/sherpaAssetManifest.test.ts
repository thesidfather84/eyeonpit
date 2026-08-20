import { describe, expect, it } from "vitest";
import { SHERPA_ASSET_MANIFEST, SHERPA_ASSET_TOTAL_BYTES, findManifestEntry, verifyFetchedAssetSize } from "./sherpaAssetManifest";

describe("SHERPA_ASSET_MANIFEST — the 2026-08-20 Blob deployment's integrity record", () => {
  it("records exactly the 5 files the provider actually requires", () => {
    const filenames = SHERPA_ASSET_MANIFEST.files.map((f) => f.filename);
    expect(filenames).toEqual([
      "sherpa-onnx-asr.js",
      "sherpa-onnx-wasm-main-asr.js",
      "sherpa-onnx-wasm-main-asr.wasm",
      "sherpa-onnx-wasm-main-asr.data",
      "bpe.vocab",
    ]);
  });

  it("every entry has a real 64-character hex sha256 and a positive size", () => {
    for (const entry of SHERPA_ASSET_MANIFEST.files) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
    }
  });

  it("no two files share a hash — each is a genuinely distinct asset", () => {
    const hashes = SHERPA_ASSET_MANIFEST.files.map((f) => f.sha256);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("the model-data package is the dominant share of the total footprint (~93%)", () => {
    const dataEntry = findManifestEntry("sherpa-onnx-wasm-main-asr.data")!;
    expect(dataEntry.sizeBytes / SHERPA_ASSET_TOTAL_BYTES).toBeGreaterThan(0.9);
  });

  it("modelVersionId encodes both the model identity and the engine version — never an unversioned mutable path", () => {
    expect(SHERPA_ASSET_MANIFEST.modelVersionId).not.toMatch(/latest/i);
    expect(SHERPA_ASSET_MANIFEST.modelVersionId).toContain(SHERPA_ASSET_MANIFEST.engineVersion);
  });
});

describe("SHERPA_ASSET_TOTAL_BYTES — derived, not hand-maintained", () => {
  it("equals the sum of every manifest entry's own size", () => {
    const expected = SHERPA_ASSET_MANIFEST.files.reduce((sum, f) => sum + f.sizeBytes, 0);
    expect(SHERPA_ASSET_TOTAL_BYTES).toBe(expected);
  });

  it("is the real, verified ~204MB total footprint", () => {
    expect(SHERPA_ASSET_TOTAL_BYTES).toBe(204249120);
  });
});

describe("findManifestEntry", () => {
  it("finds a real tracked file by exact filename", () => {
    expect(findManifestEntry("bpe.vocab")?.sizeBytes).toBe(13090);
  });

  it("returns undefined for an untracked filename", () => {
    expect(findManifestEntry("app-asr.js")).toBeUndefined();
  });
});

describe("verifyFetchedAssetSize — the runtime integrity check wired into fetchBpeVocab", () => {
  it("reports ok when the actual byte count matches the manifest exactly", () => {
    expect(verifyFetchedAssetSize("bpe.vocab", 13090)).toEqual({ ok: true });
  });

  it("reports the mismatch, naming both expected and actual, when sizes differ", () => {
    expect(verifyFetchedAssetSize("bpe.vocab", 9999)).toEqual({ ok: false, expected: 13090, actual: 9999 });
  });

  it("returns null (no opinion) for a filename this manifest doesn't track — never a false rejection of an unrelated asset", () => {
    expect(verifyFetchedAssetSize("some-other-file.txt", 42)).toBeNull();
  });
});
