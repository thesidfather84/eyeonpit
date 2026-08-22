"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Camera, Image as ImageIcon, Play, Square, Video } from "lucide-react";
import {
  CAMERA_NO_DEVICE_INSTRUCTIONS,
  CAMERA_OTHER_ERROR_INSTRUCTIONS,
  CAMERA_PERMISSION_DENIED_INSTRUCTIONS,
  classifyCameraPermissionError,
  formatResolution,
  listVideoInputDevices,
  type CameraDeviceOption,
} from "@/lib/vision/cameraCheck";
import { NoModelVisionProvider } from "@/lib/vision/noModelVisionProvider";
import type { VisionInferenceResult, VisionProvider, VisionSource } from "@/lib/vision/visionTypes";

/**
 * VISION LAB — EyeOnPit 1.15a's private, Lab-gated foundation for the
 * Enterprise Vision roadmap (AGENTS.md 1.15a). Deliberately NOT reachable
 * from Floor/Surveillance or any normal operator surface — this lives
 * behind the exact same /lab access-code gate as Mic Check, Native Voice
 * Prototype, and every other research tool (see the (protected) route
 * group's own layout).
 *
 * PRIVACY / LOCAL-ONLY, hard requirements (AGENTS.md 1.15a §3):
 *   - No cloud video processing, no camera upload, no raw video storage,
 *     no automatic screenshots, no upload of any kind — this file contains
 *     no fetch()/XHR of any kind, mirroring Mic Check's own NO UPLOAD proof.
 *   - The live camera preview and the test image both stay entirely in the
 *     browser (a local <video>/<img> element and, for detection, an
 *     in-memory <canvas> snapshot — never persisted, never sent anywhere).
 *   - No facial recognition, no biometric identification, no player
 *     identification — this only ever asks a VisionProvider "what card rank
 *     is in this frame," nothing about people.
 *   - On Stop, unmount, or navigation: every MediaStreamTrack is stopped
 *     and the camera is released — see teardown() below, mirroring Mic
 *     Check's identical camera/mic-release discipline.
 *
 * CARDEVENT FIREWALL (AGENTS.md 1.15a §7): this page never imports from
 * lib/db/repositories/investigations.ts, lib/db/repositories/cardEvents.ts,
 * lib/db/client.ts, or contexts/InvestigationContext.tsx — there is no
 * VisionProvider -> addCardEvent() path, proven both here (by the absence
 * of those imports) and by visionCardEventFirewall.test.ts's own source
 * scan + behavioral proof.
 *
 * NO MODEL IN 1.15a: the shipped provider is NoModelVisionProvider, which
 * always returns zero observations — see that file's own doc comment for
 * the licensing evaluation (Ultralytics YOLO's AGPL-3.0 terms) that led to
 * this. This page's own "Run Detection" pipeline is real and complete
 * end-to-end (camera/image -> provider.infer() -> result display); it just
 * has nothing to detect with yet.
 */

type CameraPhase = "idle" | "requesting" | "active" | "permission-denied" | "no-device" | "unsupported" | "error";

export default function VisionLabPage() {
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [trackState, setTrackState] = useState<{ readyState: MediaStreamTrackState; muted: boolean } | null>(null);
  const [videoDevices, setVideoDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [testImageUrl, setTestImageUrl] = useState<string | null>(null);

  // Static for the lifetime of this component (one provider type exists in
  // 1.15a) — read from state, never from providerRef during render, so
  // rendering never touches a ref (see teardownCamera/getProvider below for
  // the ref's actual, effect/event-only usage).
  const [providerInfo] = useState(() => new NoModelVisionProvider().info);
  const [modelLoadMs, setModelLoadMs] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<VisionInferenceResult | null>(null);
  const [lastInferenceSource, setLastInferenceSource] = useState<VisionSource | null>(null);
  const [detecting, setDetecting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const providerRef = useRef<VisionProvider | null>(null);
  const testImageUrlRef = useRef<string | null>(null);

  // Lazily created, loaded once, reused across every "Run Detection" tap —
  // load() is measured here for the diagnostics panel (AGENTS.md §12).
  const getProvider = useCallback(async (): Promise<VisionProvider> => {
    if (providerRef.current) return providerRef.current;
    const provider = new NoModelVisionProvider();
    const start = performance.now();
    await provider.load();
    setModelLoadMs(performance.now() - start);
    providerRef.current = provider;
    return provider;
  }, []);

  const teardownCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(
    () => () => {
      teardownCamera();
      providerRef.current?.dispose();
      if (testImageUrlRef.current) URL.revokeObjectURL(testImageUrlRef.current);
    },
    [teardownCamera]
  );

  const refreshDeviceList = useCallback(async () => {
    if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.enumerateDevices !== "function") return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setVideoDevices(listVideoInputDevices(devices));
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError(null);
      setCameraPhase("requesting");
      if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") {
        setCameraPhase("unsupported");
        return;
      }
      teardownCamera();
      try {
        // iPhone rear camera is the primary target (AGENTS.md §2) —
        // facingMode "environment" requests it by default; an explicit
        // deviceId (from the selector, once permission has revealed real
        // device labels) overrides that.
        const videoConstraints: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: "environment" } };
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setDeviceLabel(track?.label || null);
        setTrackState(track ? { readyState: track.readyState, muted: track.muted } : null);
        const settings = track?.getSettings?.();
        setResolution(formatResolution(settings?.width, settings?.height));
        setSelectedDeviceId(track?.getSettings?.().deviceId ?? deviceId ?? null);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        await refreshDeviceList();
        setCameraPhase("active");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setCameraError(message);
        const kind = classifyCameraPermissionError(message);
        setCameraPhase(kind === "permission-denied" ? "permission-denied" : kind === "no-device" ? "no-device" : "error");
      }
    },
    [refreshDeviceList, teardownCamera]
  );

  const stopCamera = useCallback(() => {
    teardownCamera();
    setCameraPhase("idle");
    setDeviceLabel(null);
    setResolution(null);
    setTrackState(null);
  }, [teardownCamera]);

  const handleSelectDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      void startCamera(deviceId);
    },
    [startCamera]
  );

  const handleTestImageChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (testImageUrlRef.current) URL.revokeObjectURL(testImageUrlRef.current);
    // Local Blob URL only — the file is never read into a form field,
    // never uploaded, never leaves this tab. See this page's own PRIVACY
    // doc comment.
    const url = URL.createObjectURL(file);
    testImageUrlRef.current = url;
    setTestImageUrl(url);
    setLastResult(null);
  }, []);

  const runDetection = useCallback(
    async (source: VisionSource) => {
      const frame = source === "camera" ? videoRef.current : imageRef.current;
      if (!frame) return;
      setDetecting(true);
      try {
        const provider = await getProvider();
        const start = performance.now();
        const result = await provider.infer(frame, source);
        if (result.inferenceMs == null) result.inferenceMs = performance.now() - start;
        setLastResult(result);
        setLastInferenceSource(source);
      } finally {
        setDetecting(false);
      }
    },
    [getProvider]
  );

  const approxFps = lastResult?.inferenceMs ? Math.round((1000 / lastResult.inferenceMs) * 10) / 10 : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/lab" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Lab
      </Link>
      <div className="flex items-center gap-2">
        <Camera className="h-6 w-6 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">📷 Vision Lab</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Enterprise Vision foundation (1.15a) — camera/image → local model → observation only. Nothing here reads
        from or writes to any investigation. No cloud processing, no upload, no raw video storage, no facial or
        player identification. See Model Info below for what is (and isn&apos;t) integrated yet.
      </p>

      {/* CAMERA CHECK */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Video className="h-4 w-4 text-accent" aria-hidden /> Camera Check
        </h2>

        {cameraPhase === "idle" && (
          <button
            type="button"
            onClick={() => startCamera(selectedDeviceId ?? undefined)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-foreground"
          >
            <Video className="h-5 w-5" aria-hidden /> Start Camera
          </button>
        )}

        {cameraPhase === "requesting" && <p className="text-sm text-muted-foreground">Requesting camera permission…</p>}

        {cameraPhase === "permission-denied" && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            <p className="font-bold">Camera permission was denied.</p>
            <p className="mt-1">{CAMERA_PERMISSION_DENIED_INSTRUCTIONS}</p>
            <button type="button" onClick={() => startCamera()} className="mt-3 min-h-11 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white">
              Try Again
            </button>
          </div>
        )}

        {cameraPhase === "no-device" && (
          <div className="rounded-lg border border-pending/40 bg-pending/10 p-4 text-sm text-pending" role="alert">
            <p className="font-bold">No camera found.</p>
            <p className="mt-1">{CAMERA_NO_DEVICE_INSTRUCTIONS}</p>
            <button type="button" onClick={() => startCamera()} className="mt-3 min-h-11 rounded-lg bg-pending px-4 py-2 text-sm font-semibold text-white">
              Try Again
            </button>
          </div>
        )}

        {cameraPhase === "unsupported" && (
          <div className="rounded-lg border border-pending/40 bg-pending/10 p-4 text-sm text-pending" role="alert">
            <p className="font-bold">This browser doesn&apos;t support camera access.</p>
            <p className="mt-1">Try a recent version of Chrome, Safari, or Edge.</p>
          </div>
        )}

        {cameraPhase === "error" && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            <p className="font-bold">Could not access the camera.</p>
            <p className="mt-1">{CAMERA_OTHER_ERROR_INSTRUCTIONS}</p>
            {cameraError && <p className="mt-1 text-xs opacity-80">({cameraError})</p>}
            <button type="button" onClick={() => startCamera()} className="mt-3 min-h-11 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white">
              Try Again
            </button>
          </div>
        )}

        {/* The <video> element always renders once camera setup has ever been attempted, so streamRef can attach to a real node — hidden until active to avoid an empty black box in every other phase. */}
        <video
          ref={videoRef}
          playsInline
          muted
          data-testid="vision-camera-preview"
          className={cameraPhase === "active" ? "w-full max-w-sm rounded-lg border border-border" : "hidden"}
        />

        {cameraPhase === "active" && (
          <div className="flex flex-col gap-3">
            {videoDevices.length > 1 && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Select Camera
                <select
                  value={selectedDeviceId ?? ""}
                  onChange={(e) => handleSelectDevice(e.target.value)}
                  className="min-h-11 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground"
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="rounded-xl border border-border bg-surface-raised p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Status: </span>
                <span data-testid="vision-camera-status">Streaming</span>
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Device: </span>
                <span data-testid="vision-camera-device-label">{deviceLabel || "(browser did not expose a device name)"}</span>
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Resolution: </span>
                <span data-testid="vision-camera-resolution">{resolution ?? "—"}</span>
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">MediaStreamTrack state: </span>
                <span data-testid="vision-camera-stream-state">
                  {trackState ? `${trackState.readyState}${trackState.muted ? " (muted)" : ""}` : "—"}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runDetection("camera")}
                disabled={detecting}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
              >
                <Play className="h-4 w-4" aria-hidden /> Run Detection
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-raised px-4 py-3 text-sm font-semibold text-muted-foreground"
              >
                <Square className="h-4 w-4" aria-hidden /> Stop Camera
              </button>
            </div>
          </div>
        )}
      </section>

      {/* STILL-IMAGE TEST MODE */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ImageIcon className="h-4 w-4 text-accent" aria-hidden /> Test Image
        </h2>
        <p className="text-xs text-muted-foreground">
          Select a local image containing playing cards for reproducible testing without a live table. The image
          stays on this device.
        </p>
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm font-semibold text-foreground">
          <ImageIcon className="h-4 w-4" aria-hidden /> Choose Image
          <input type="file" accept="image/*" onChange={handleTestImageChange} className="hidden" data-testid="vision-test-image-input" />
        </label>

        {testImageUrl && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local Blob URL only, never a remote/optimizable src */}
            <img
              ref={imageRef}
              src={testImageUrl}
              alt="Selected test image"
              data-testid="vision-test-image-preview"
              className="max-w-sm rounded-lg border border-border"
            />
            <button
              type="button"
              onClick={() => runDetection("still-image")}
              disabled={detecting}
              className="flex min-h-11 w-fit items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              <Play className="h-4 w-4" aria-hidden /> Run Detection
            </button>
          </div>
        )}
      </section>

      {/* DETECTION RESULT */}
      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4" data-testid="vision-detection-result">
        <h2 className="text-sm font-bold text-foreground">Detection Result</h2>
        {!lastResult ? (
          <p className="text-xs text-muted-foreground">Run detection against the camera or a test image to see results here.</p>
        ) : lastResult.observations.length === 0 ? (
          <p className="text-xs text-pending">
            No model integrated yet — {providerInfo.unavailableReason ?? "see Model Info below."} ({lastInferenceSource})
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {lastResult.observations.map((obs, i) => (
              <li key={i} className="rounded-lg border border-border bg-surface-raised p-3">
                <span className="text-lg font-extrabold text-foreground">{obs.rank}</span>
                <span className="ml-2 text-sm text-muted-foreground">{Math.round(obs.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* MODEL INFO */}
      <section className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-xs text-muted-foreground" data-testid="vision-model-info">
        <h2 className="text-sm font-bold text-foreground">Model Info</h2>
        <p>
          <span className="font-semibold text-foreground">Runtime: </span>
          {providerInfo.runtime}
        </p>
        <p>
          <span className="font-semibold text-foreground">Model: </span>
          {providerInfo.modelName} ({providerInfo.modelVersion})
        </p>
        {providerInfo.modelSizeLabel && (
          <p>
            <span className="font-semibold text-foreground">Size: </span>
            {providerInfo.modelSizeLabel}
          </p>
        )}
        <p>
          <span className="font-semibold text-foreground">Inference: </span>
          {providerInfo.inference.toUpperCase()}
        </p>
        <p>
          <span className="font-semibold text-foreground">License: </span>
          {providerInfo.license}
        </p>
        {providerInfo.unavailableReason && <p className="mt-1 text-pending">{providerInfo.unavailableReason}</p>}
      </section>

      {/* DIAGNOSTICS */}
      <section className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-xs text-muted-foreground" data-testid="vision-diagnostics">
        <h2 className="text-sm font-bold text-foreground">Diagnostics</h2>
        <p>
          <span className="font-semibold text-foreground">Model load time: </span>
          {modelLoadMs != null ? `${modelLoadMs.toFixed(1)} ms` : "— (not loaded yet)"}
        </p>
        <p>
          <span className="font-semibold text-foreground">Last inference latency: </span>
          {lastResult?.inferenceMs != null ? `${lastResult.inferenceMs.toFixed(1)} ms` : "— (run detection first)"}
        </p>
        <p>
          <span className="font-semibold text-foreground">Approx. FPS (from last inference): </span>
          {approxFps != null ? approxFps : "—"}
        </p>
      </section>
    </div>
  );
}
