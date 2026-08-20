/**
 * SHERPA_ASSET_MANIFEST — the authoritative record of exactly which files
 * this provider needs, at exactly what version, and what they should look
 * like — written 2026-08-20 alongside the Vercel Blob deployment that fixed
 * the "assets-not-found" production incident (see
 * docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md and sherpaOnnxProvider.ts's own
 * ASSET DEPLOYMENT doc comment). Its purpose is narrow and explicit: make
 * ACCIDENTAL MODEL/VERSION MIXING DETECTABLE — a future re-upload that
 * silently swaps in a different model build, or a config pointing
 * `assetBaseUrl` at the wrong version directory, should be catchable
 * against this record rather than discovered only as a mysterious
 * recognition-quality regression.
 *
 * `modelVersionId` IS the version-pinned path segment this manifest
 * describes (see ASSET DEPLOYMENT) — e.g. assets live at
 * `<assetBaseUrl>/sherpa/${modelVersionId}/<filename>`. Every file's
 * `sha256` was computed directly from the exact local files this round
 * verified running (see sherpaOnnxProvider.ts's own VERIFICATION section)
 * and uploaded — not copied from upstream release notes.
 *
 * WHAT THIS DOES AND DOESN'T ENFORCE AT RUNTIME: `bpe.vocab` is fetched via
 * plain `fetch()` (see fetchBpeVocab in sherpaOnnxProvider.ts), so its
 * response size is checked against this manifest before use — see
 * `verifyFetchedAssetSize` below. The WASM glue scripts and the ~204MB
 * `.wasm`/`.data` payload are loaded via Emscripten's own internal fetch
 * machinery (triggered by a plain `<script src>` tag — see `loadScript`),
 * which this provider has no hook into to inspect response size/hash
 * before the browser commits to using it. Full runtime integrity
 * verification of those three files would require replacing Emscripten's
 * own asset-loading path (a materially larger architectural change than
 * this round's "smallest safe implementation" scope) — this manifest still
 * records their expected size/hash for MANUAL/offline verification (e.g.
 * `sha256sum` against a fresh download, or an upload script diffing this
 * manifest before pushing to Blob) and as the single source of truth this
 * file's own doc comment and any future re-upload should be checked
 * against, even though nothing here blocks a browser from loading a
 * mismatched `.wasm`/`.data` file directly.
 */

export interface SherpaAssetManifestEntry {
  filename: string;
  sizeBytes: number;
  sha256: string;
}

export const SHERPA_ASSET_MANIFEST = {
  /** The version-pinned path segment — see ASSET DEPLOYMENT in sherpaOnnxProvider.ts. Encodes both the model identity and the engine/WASM release it was built from, so two genuinely different builds can never collide at the same path. */
  modelVersionId: "en-zipformer-2023-06-21-v1.13.6",
  engineVersion: "1.13.6",
  bundledModel: "sherpa-onnx-streaming-zipformer-en-2023-06-21",
  uploadedOn: "2026-08-20",
  files: [
    { filename: "sherpa-onnx-asr.js", sizeBytes: 53867, sha256: "d51ae8e8b756ee5e53423ffada0c9702973f154f561aca7984fe0b12f4060178" },
    { filename: "sherpa-onnx-wasm-main-asr.js", sizeBytes: 82688, sha256: "fd9e40cb7f871a94132fd722bde8a18aeb41a7e8cb95eee81a55b510e621c20a" },
    { filename: "sherpa-onnx-wasm-main-asr.wasm", sizeBytes: 13148431, sha256: "49d1a11fb0c582b93e2b5bcd4fdfacb9b50614c1d4f3edc8648b20bcebb99cd0" },
    { filename: "sherpa-onnx-wasm-main-asr.data", sizeBytes: 190951044, sha256: "b80cd7fc7c709509fadd2a9fdcd33ea2eb4803227871a3848d7cd055d84375bf" },
    { filename: "bpe.vocab", sizeBytes: 13090, sha256: "07faf15b7ce36e03c516479bb72b5d32bc74363ffa7151a60c4c5a689f32159e" },
  ] as const satisfies readonly SherpaAssetManifestEntry[],
} as const;

/** Total footprint, bytes — derived from the manifest rather than hand-maintained separately, so it can never silently drift out of sync with the per-file entries above. */
export const SHERPA_ASSET_TOTAL_BYTES: number = SHERPA_ASSET_MANIFEST.files.reduce((sum, f) => sum + f.sizeBytes, 0);

export function findManifestEntry(filename: string): SherpaAssetManifestEntry | undefined {
  return SHERPA_ASSET_MANIFEST.files.find((f) => f.filename === filename);
}

/**
 * Cheap, real runtime check for an asset actually fetched via `fetch()`
 * (currently only `bpe.vocab` — see this module's own doc comment for why
 * the WASM/data files aren't checked this way). Compares the ACTUAL byte
 * length of what was fetched against this manifest's recorded size for
 * that filename; a mismatch means either the manifest is stale or a
 * different file is now living at that URL than this provider was built
 * against — either way, surfacing it beats silently proceeding with an
 * unexpected model. Returns `null` (no opinion) for a filename this
 * manifest doesn't track, so a caller can still choose to fail open rather
 * than reject an asset this manifest was simply never told about.
 */
export function verifyFetchedAssetSize(filename: string, actualBytes: number): { ok: true } | { ok: false; expected: number; actual: number } | null {
  const entry = findManifestEntry(filename);
  if (!entry) return null;
  return actualBytes === entry.sizeBytes ? { ok: true } : { ok: false, expected: entry.sizeBytes, actual: actualBytes };
}
