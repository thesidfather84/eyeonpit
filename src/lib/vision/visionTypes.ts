/**
 * EyeOnPit 1.15a — Vision foundation types. This is the ENTIRE contract
 * between a camera/image source and the rest of the app: a VisionProvider
 * takes a frame and returns VisionObservations, nothing else. No provider
 * implementation in this file, and nothing here imports from
 * lib/db/repositories/{investigations,cardEvents}.ts — see
 * visionCardEventFirewall.test.ts for the enforced regression proving that
 * boundary, and CardEventFirewall.md-equivalent doc comment on
 * VisionObservation below for why.
 *
 * Small and replaceable on purpose (AGENTS.md 1.15a §5): swapping the
 * underlying model/runtime later means writing a new VisionProvider, never
 * touching this file or any game-state code.
 */

/** Where a frame came from — kept on every observation for later auditing (e.g. distinguishing a live-camera misread from a still-image test run). */
export type VisionSource = "camera" | "still-image";

/**
 * The minimum safe representation of "the model thinks it saw a card rank
 * in this frame" (AGENTS.md 1.15a §6). Deliberately NOT a CardEvent:
 *
 *   - A CardEvent is a deterministic, operator-attributed ledger entry that
 *     drives the running count, true count, and shoe/round state — every
 *     one of those is safety-critical to a surveillance investigation.
 *   - A VisionObservation is a probabilistic, unattributed, un-actioned
 *     guess from a model that has not yet been proven accurate. It has no
 *     seat/round/shoe attached (zone assignment is explicitly out of scope
 *     until 1.15b — see AGENTS.md §6/§13) and no path to becoming a
 *     CardEvent automatically.
 *
 * Converting an observation into a real CardEvent, if that's ever done, is
 * necessarily a FUTURE, explicit, human-reviewed decision — never something
 * this type or any code in lib/vision/ performs on its own.
 */
export interface VisionObservation {
  type: "card";
  /** The model's best guess at the rank ("A", "2"-"10", "J", "Q", "K") — intentionally a plain string, not the app's own CardRank type, so a model's raw output is never silently treated as ledger-ready input. */
  rank: string;
  /** 0-1 model confidence. Not a probability guarantee — just whatever score the provider's model reports. */
  confidence: number;
  /** Epoch ms when the observation was produced. */
  timestamp: number;
  source: VisionSource;
  modelId: string;
  modelVersion: string;
}

/** Static facts about the model/runtime a VisionProvider wraps — surfaced verbatim in Vision Lab's Model Info panel (AGENTS.md §11) for future Enterprise auditing. */
export interface VisionModelInfo {
  runtime: string;
  modelName: string;
  modelVersion: string;
  /** Human-readable, e.g. "4.2 MB" — omitted (undefined) when not known/applicable. */
  modelSizeLabel?: string;
  /** Always "local" in 1.15a — see AGENTS.md §3's hard no-cloud-processing requirement. Kept as a field (not a hardcoded UI string) so a future provider is structurally forced to state it, not just default to what looks safe. */
  inference: "local";
  license: string;
  /** Set when no real model is wired up yet (see NoModelVisionProvider) — Vision Lab shows this verbatim instead of pretending inference is available. */
  unavailableReason?: string;
}

export interface VisionInferenceResult {
  observations: VisionObservation[];
  /** Wall-clock ms the provider spent on this single inference call, when measurable — for the Basic Diagnostics panel (AGENTS.md §12). */
  inferenceMs?: number;
}

/**
 * The one boundary a camera/image source talks to. `infer` takes whatever
 * frame source the caller has (an HTMLVideoElement for live camera, an
 * HTMLImageElement/ImageBitmap for the still-image test) and returns
 * observations only — never a Promise that resolves by mutating anything
 * outside itself.
 */
export interface VisionProvider {
  readonly info: VisionModelInfo;
  /** Resolves once the model/runtime is ready to run `infer` (may be a no-op for a provider with nothing to load). */
  load(): Promise<void>;
  infer(frame: CanvasImageSource, source: VisionSource): Promise<VisionInferenceResult>;
  /** Releases any runtime/session resources. Idempotent. */
  dispose(): void;
}
