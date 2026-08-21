"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, Play, RotateCcw, Square } from "lucide-react";
import {
  classifyMicPermissionError,
  computePeak,
  computeRms,
  isSignalDetected,
  MIC_CHECK_NO_DEVICE_INSTRUCTIONS,
  MIC_CHECK_OTHER_ERROR_INSTRUCTIONS,
  MIC_CHECK_PERMISSION_DENIED_INSTRUCTIONS,
  MIC_CHECK_RECORDING_DURATION_MS,
  type MicCheckVerdict,
} from "@/lib/voice/micCheck";

/**
 * MIC CHECK — permanent Lab tool. Tests the browser's RAW microphone
 * directly — getUserMedia + AudioContext/AnalyserNode + MediaRecorder only.
 * Deliberately imports NOTHING from voskProvider.ts, whisperCppProvider.ts,
 * sherpaOnnxProvider.ts, or browserWebSpeechProvider.ts — this must keep
 * working (and answering "is it my mic or the recognizer?") even if every
 * one of those has a real bug. See micCheck.ts for the pure, provider-
 * independent helpers this page is built on.
 *
 * PRIVACY, hard requirements:
 *   - No raw microphone audio is ever uploaded — this file contains no
 *     fetch()/XHR of any kind.
 *   - No raw audio is saved to a Lab JSON export — this page has NO export
 *     feature at all (the class of risk that constraint's about doesn't
 *     exist here, not because it's separately guarded elsewhere).
 *   - No recording outside an explicit Mic Check session — MediaRecorder
 *     only ever runs for the fixed MIC_CHECK_RECORDING_DURATION_MS window,
 *     started only by an explicit operator tap.
 *   - Playback is 100% local (a Blob URL fed to a local <audio> element,
 *     never sent anywhere) and is destroyed (URL.revokeObjectURL + all
 *     tracks stopped + AudioContext closed) on Reset and on unmount.
 *
 * MOBILE: every control here uses large (min 44px) touch targets for
 * iPhone/iPad use, per explicit instruction — this page's own layout,
 * not a broader Lab redesign.
 */

type Phase = "idle" | "requesting" | "active" | "permission-denied" | "no-device" | "unsupported" | "error";

export default function MicCheckPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [trackState, setTrackState] = useState<{ readyState: MediaStreamTrackState; muted: boolean } | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [level, setLevel] = useState<{ peak: number; rms: number }>({ peak: 0, rms: 0 });
  const [everDetectedSignal, setEverDetectedSignal] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "ready">("idle");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [recorderSupported, setRecorderSupported] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const verdict: MicCheckVerdict =
    phase === "permission-denied"
      ? "permission-denied"
      : phase === "no-device"
        ? "no-device"
        : phase === "unsupported"
          ? "unsupported"
          : phase === "active"
            ? everDetectedSignal
              ? "working"
              : "no-audio"
            : "checking";

  const stopLevelLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    stopLevelLoop();
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  }, [playbackUrl, stopLevelLoop]);

  useEffect(() => teardown, [teardown]);

  const runLevelLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      const peak = computePeak(buffer);
      const rms = computeRms(buffer);
      setLevel({ peak, rms });
      if (isSignalDetected(peak)) setEverDetectedSignal(true);
      setAudioContextState(audioContextRef.current?.state ?? null);
      const track = streamRef.current?.getAudioTracks()[0];
      if (track) setTrackState({ readyState: track.readyState, muted: track.muted });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startCheck = useCallback(async () => {
    setErrorMessage(null);
    setEverDetectedSignal(false);
    setPhase("requesting");
    if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setPhase("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      setDeviceLabel(track?.label || null);
      setTrackState(track ? { readyState: track.readyState, muted: track.muted } : null);

      // Older Safari/iOS only expose the prefixed constructor — a real,
      // still-relevant fallback for the exact mobile devices this tool's
      // own DEVICE READINESS requirement cares about.
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        setPhase("unsupported");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      setAudioContextState(audioContext.state);
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      setRecorderSupported(typeof MediaRecorder !== "undefined");
      setPhase("active");
      runLevelLoop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      const kind = classifyMicPermissionError(message);
      setPhase(kind === "permission-denied" ? "permission-denied" : kind === "no-device" ? "no-device" : "error");
    }
  }, [runLevelLoop]);

  const reset = useCallback(() => {
    teardown();
    setPhase("idle");
    setErrorMessage(null);
    setDeviceLabel(null);
    setTrackState(null);
    setAudioContextState(null);
    setLevel({ peak: 0, rms: 0 });
    setEverDetectedSignal(false);
    setRecordingState("idle");
    setPlaybackUrl(null);
  }, [teardown]);

  const recordSample = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") return;
    if (playbackUrl) {
      URL.revokeObjectURL(playbackUrl);
      setPlaybackUrl(null);
    }
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      // Local-only Blob URL — never sent anywhere, never persisted beyond
      // this session. See this page's own PRIVACY doc comment.
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      setPlaybackUrl(URL.createObjectURL(blob));
      setRecordingState("ready");
    };
    recorder.start();
    setRecordingState("recording");
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MIC_CHECK_RECORDING_DURATION_MS);
  }, [playbackUrl]);

  const playSample = useCallback(() => {
    audioElRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/lab/native-voice-test" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Native Voice
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Mic className="h-6 w-6 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">🎤 Mic Check</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Tests your browser&apos;s raw microphone directly — not Vosk, Whisper, Sherpa, or Browser Web Speech. Use this
        before testing any voice provider to confirm the microphone itself is working.
      </p>

      {phase === "idle" && (
        <button
          type="button"
          onClick={startCheck}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-foreground"
        >
          <Mic className="h-5 w-5" aria-hidden /> Start Mic Check
        </button>
      )}

      {phase === "requesting" && <p className="text-sm text-muted-foreground">Requesting microphone permission…</p>}

      {phase === "permission-denied" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <p className="font-bold">Microphone permission was denied.</p>
          <p className="mt-1">{MIC_CHECK_PERMISSION_DENIED_INSTRUCTIONS}</p>
          <button type="button" onClick={startCheck} className="mt-3 min-h-11 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white">
            Try Again
          </button>
        </div>
      )}

      {phase === "no-device" && (
        <div className="rounded-lg border border-pending/40 bg-pending/10 p-4 text-sm text-pending" role="alert">
          <p className="font-bold">No microphone found.</p>
          <p className="mt-1">{MIC_CHECK_NO_DEVICE_INSTRUCTIONS}</p>
          <button type="button" onClick={startCheck} className="mt-3 min-h-11 rounded-lg bg-pending px-4 py-2 text-sm font-semibold text-white">
            Try Again
          </button>
        </div>
      )}

      {phase === "unsupported" && (
        <div className="rounded-lg border border-pending/40 bg-pending/10 p-4 text-sm text-pending" role="alert">
          <p className="font-bold">This browser doesn&apos;t support microphone access.</p>
          <p className="mt-1">Try a recent version of Chrome, Safari, or Edge.</p>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <p className="font-bold">Could not access the microphone.</p>
          <p className="mt-1">{MIC_CHECK_OTHER_ERROR_INSTRUCTIONS}</p>
          {errorMessage && <p className="mt-1 text-xs opacity-80">({errorMessage})</p>}
          <button type="button" onClick={startCheck} className="mt-3 min-h-11 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white">
            Try Again
          </button>
        </div>
      )}

      {phase === "active" && (
        <div className="flex flex-col gap-4">
          <div
            className={`rounded-lg border p-4 text-center text-xl font-bold ${
              verdict === "working" ? "border-status-green/40 bg-status-green/10 text-status-green" : "border-pending/40 bg-pending/10 text-pending"
            }`}
            data-testid="mic-check-verdict"
          >
            {verdict === "working" ? "MICROPHONE WORKING ✓" : "NO AUDIO DETECTED ✕"}
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-muted-foreground">Live input level</p>
            <div className="mt-2 h-6 w-full overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={Math.round(level.peak * 100)}>
              <div
                data-testid="mic-check-level-bar"
                className={`h-full rounded-full transition-[width] duration-75 ${isSignalDetected(level.peak) ? "bg-status-green" : "bg-muted-foreground/40"}`}
                style={{ width: `${Math.min(100, Math.round(level.peak * 400))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Peak: {level.peak.toFixed(3)} · RMS: {level.rms.toFixed(3)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Device: </span>
              <span data-testid="mic-check-device-label">{deviceLabel || "(browser did not expose a device name)"}</span>
            </p>
            <p className="mt-1">
              <span className="font-semibold text-foreground">MediaStreamTrack state: </span>
              <span data-testid="mic-check-track-state">{trackState ? `${trackState.readyState}${trackState.muted ? " (muted)" : ""}` : "—"}</span>
            </p>
            <p className="mt-1">
              <span className="font-semibold text-foreground">AudioContext state: </span>
              <span data-testid="mic-check-audiocontext-state">{audioContextState ?? "—"}</span>
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-foreground">Local playback test</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Records ~3 seconds locally. Playback never leaves your browser and is discarded on Reset.
            </p>
            {!recorderSupported ? (
              <p className="mt-2 text-xs text-pending">Recording isn&apos;t supported in this browser — the level meter above still works.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={recordSample}
                  disabled={recordingState === "recording"}
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-raised px-4 py-3 text-sm font-semibold text-foreground disabled:opacity-40"
                >
                  <Square className="h-4 w-4" aria-hidden />
                  {recordingState === "recording" ? "Recording…" : "Record ~3-Second Sample"}
                </button>
                <button
                  type="button"
                  onClick={playSample}
                  disabled={!playbackUrl}
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                >
                  <Play className="h-4 w-4" aria-hidden /> Play Back My Voice
                </button>
              </div>
            )}
            {playbackUrl && <audio ref={audioElRef} src={playbackUrl} className="hidden" data-testid="mic-check-playback-audio" />}
          </div>

          <button
            type="button"
            onClick={reset}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-surface-raised px-4 py-3 text-sm font-semibold text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset Mic Check
          </button>
        </div>
      )}
    </div>
  );
}
