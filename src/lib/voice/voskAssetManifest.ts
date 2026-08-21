/**
 * VOSK_ASSET_MANIFEST — the authoritative record of the Native Voice
 * Prototype's one committed binary asset, mirroring sherpaAssetManifest.ts's
 * own purpose and doc comment: make accidental model/version mixing
 * detectable, never assume it silently matches.
 *
 * Unlike sherpa-onnx/whisper.cpp, the vosk-browser WASM RUNTIME is not a
 * separate asset here at all — it's imported as an ordinary npm dependency
 * (`vosk-browser`, pinned in package.json) and bundled by Next.js like any
 * other package; only the ACOUSTIC MODEL itself is a committed binary. Real,
 * verified provenance: downloaded directly from alphacephei.com/vosk/models
 * (the official Vosk model host) 2026-08-21, sha256-recorded BEFORE
 * repacking, then repacked (identical file contents, only the archive
 * format and the top-level directory name changed to "model/" per
 * vosk-browser's own documented model-format requirement — see its
 * README.md's "Model format" section) into the gzipped tar vosk-browser's
 * `createModel()` actually loads.
 */

export interface VoskAssetManifestEntry {
  filename: string;
  sizeBytes: number;
  sha256: string;
}

export const VOSK_ASSET_MANIFEST = {
  modelName: "vosk-model-small-en-us-0.15",
  modelSource: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
  modelLicense: "Apache-2.0",
  /** sha256 of the ORIGINAL, unmodified .zip as downloaded from alphacephei.com — verifies provenance independent of the repack step below. */
  originalZipSha256: "30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498",
  originalZipSizeBytes: 41205931,
  runtimePackage: "vosk-browser",
  runtimePackageVersion: "0.0.8",
  runtimeLicense: "Apache-2.0",
  runtimeRepository: "https://github.com/ccoreilly/vosk-browser",
  downloadedOn: "2026-08-21",
  files: [
    // The repacked model actually served from public/vosk-lab/ and loaded
    // via createModel(modelUrl) at runtime. Same file contents as the
    // original zip (verified: same per-file bytes, only container format +
    // top-level dir name changed), independently sha256-recorded.
    { filename: "vosk-model-small-en-us-0.15.tar.gz", sizeBytes: 41206528, sha256: "8067729ab10947eed53a0571d1956e4834f22f650c7a7e1dbf3cd3dfa24d4633" },
  ] as const satisfies readonly VoskAssetManifestEntry[],
} as const;

export function findVoskManifestEntry(filename: string): VoskAssetManifestEntry | undefined {
  return VOSK_ASSET_MANIFEST.files.find((f) => f.filename === filename);
}
