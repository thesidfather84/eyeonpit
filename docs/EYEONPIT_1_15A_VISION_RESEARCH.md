# EyeOnPit 1.15a — Vision Runtime/Model Research

Referenced from `src/lib/vision/noModelVisionProvider.ts`. This is the
focused technical evaluation AGENTS.md 1.15a §8 asked for, done before
writing any Vision Lab code.

## Runtime: ONNX Runtime Web vs. TensorFlow.js

**Chosen (for a future 1.15b model integration): ONNX Runtime Web.**

| | ONNX Runtime Web | TensorFlow.js |
|---|---|---|
| License | MIT | Apache-2.0 |
| iPhone Safari | WASM backend works (CPU, no WebGPU on iOS yet — Safari 26 is expected to add WebGPU) | Works similarly; also no WebGPU on iOS yet |
| Windows Chrome | WASM + WebGPU both available | WebGPU/WebGL both available |
| Offline after asset cache | Yes — WASM binary + model weights are static assets | Yes |
| Ecosystem for a small classifier | Straightforward: export any PyTorch/TF classifier to ONNX, run with `onnxruntime-web` | Also straightforward; more "batteries included" pretrained models for common vision tasks (not playing cards specifically) |

Both are viable. ONNX Runtime Web is the pick because (a) it is
runtime-agnostic of the training framework — a future from-scratch model
trained in plain PyTorch exports to ONNX directly — and (b) its WASM CPU
path is the most universally supported one across iPhone Safari and
desktop Chrome today, which matters more than WebGPU speed for a first
real model.

**Neither package is added as a dependency in 1.15a** — see below for why
there is nothing to run through either runtime yet.

## Model: no commercially safe pretrained playing-card model was found

Searched: Roboflow Universe playing-card detection listings (multiple),
a GitHub project with a CC0-licensed 20,000-image synthetic playing-card
dataset, and Hugging Face for any pretrained ONNX/TensorFlow.js playing-card
classifier.

**Finding:** every readily available playing-card *detection* model found
is trained via Ultralytics YOLO tooling (YOLOv5/v8/v11). Per Ultralytics'
own license terms, **all YOLO-trained models — the weights themselves, not
just the training/inference code — are AGPL-3.0 licensed**, independent of
what runtime later loads those weights. Closed-source commercial use
requires a paid Ultralytics Enterprise License; without one, shipping a
YOLO-trained model in EyeOnPit would obligate open-sourcing the whole
application under AGPL-3.0. This is exactly the risk AGENTS.md 1.15a §8
warned against ("do NOT blindly add a YOLO dependency").

The one dataset found under a genuinely permissive license (CC0) is *just
a dataset* — using it safely means training a non-YOLO classifier
(e.g. a small MobileNet/EfficientNet-style CNN) from scratch with an
unencumbered training pipeline (plain PyTorch/TensorFlow, not Ultralytics'
library), which is real training work, not a "focused technical
evaluation."

## Decision for 1.15a

Per AGENTS.md 1.15a §9's explicit instruction ("if no suitable model can
be safely integrated... DO NOT fake it, finish the camera/provider
architecture and report exactly what model/training work 1.15b
requires"): **no model is integrated this cycle.** `NoModelVisionProvider`
is the real, shipped `VisionProvider` — architecture-complete, honest
about having nothing to detect with, licensed `n/a`.

## What 1.15b needs, concretely

One of:

1. **Purchase an Ultralytics Enterprise License** and use an existing
   YOLO-trained playing-card model (fastest path to real accuracy, real
   recurring cost, ties EyeOnPit's Vision roadmap to Ultralytics).
2. **Train a small non-YOLO classifier from scratch** on the CC0
   20,000-image synthetic playing-card dataset (or a newly captured/
   licensed dataset), using a plain, unencumbered architecture and
   training pipeline, then export to ONNX for `onnxruntime-web`. Slower to
   reach production accuracy, but license-clean and fully owned.

Either path plugs into the existing `VisionProvider` interface
(`src/lib/vision/visionTypes.ts`) as a new class — no other app code
changes.
