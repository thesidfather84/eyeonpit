import type { VisionInferenceResult, VisionModelInfo, VisionProvider, VisionSource } from "./visionTypes";

/**
 * EyeOnPit 1.15a's real, shipped VisionProvider. No card-rank model is
 * integrated this cycle — see docs/EYEONPIT_1_15A_VISION_RESEARCH.md for
 * the full runtime/model evaluation. In short: every readily-available
 * playing-card detection model found (Roboflow Universe listings, the CC0-
 * dataset GitHub project) is trained via Ultralytics YOLO tooling, and
 * Ultralytics' own license terms place ALL YOLO-trained models under
 * AGPL-3.0 regardless of the runtime used to run the exported weights —
 * closed-source commercial use requires a paid Enterprise License. Rather
 * than integrate a model whose licensing is questionable ("blindly add a
 * YOLO dependency" is explicitly what AGENTS.md 1.15a §8 forbids), this
 * provider is the honest, architecture-complete stand-in: it loads
 * instantly, never claims to see anything, and `infer` always returns zero
 * observations. Swapping in a real model later (either a purchased
 * Ultralytics Enterprise License, or a from-scratch classifier trained on
 * the CC0 dataset with a non-YOLO architecture) means writing a new
 * VisionProvider — nothing else in the app changes.
 */
export class NoModelVisionProvider implements VisionProvider {
  readonly info: VisionModelInfo = {
    runtime: "none",
    modelName: "none",
    modelVersion: "none",
    inference: "local",
    license: "n/a — no model integrated",
    unavailableReason:
      "No card-rank model is integrated in EyeOnPit 1.15a. Every readily available playing-card detection model evaluated is trained via Ultralytics YOLO tooling, which places AGPL-3.0 obligations on the trained model itself; closed-source commercial use needs a paid Ultralytics Enterprise License or a from-scratch, non-YOLO model. See the 1.15a final report for the full evaluation.",
  };

  async load(): Promise<void> {
    // Nothing to load — documented, not a hidden no-op.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match VisionProvider; this implementation genuinely has nothing to inspect the frame with.
  async infer(frame: CanvasImageSource, source: VisionSource): Promise<VisionInferenceResult> {
    return { observations: [], inferenceMs: 0 };
  }

  dispose(): void {
    // No runtime session to release.
  }
}
