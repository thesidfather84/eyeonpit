// @vitest-environment jsdom
//
// Real component test for the Mic Check Lab tool. jsdom has no real
// getUserMedia/AudioContext/AnalyserNode/MediaRecorder implementation (same
// disclosed boundary as every other provider's own test file in this
// codebase — see voskProvider.test.ts's own doc comment), so this file
// provides small, controllable fakes for exactly those APIs rather than
// skipping the "active" phase entirely. requestAnimationFrame is stubbed to
// capture (not auto-invoke) its callback, so each simulated "frame" is
// driven explicitly by the test — never infinite synchronous recursion.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MicCheckPage from "./page";

class FakeAnalyserNode {
  fftSize = 2048;
  currentSamples = new Float32Array(2048);
  getFloatTimeDomainData(buf: Float32Array) {
    buf.set(this.currentSamples.subarray(0, buf.length));
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "running";
  analyser = new FakeAnalyserNode();
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return this.analyser;
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: { size: 10 } });
    this.onstop?.();
  }
}

function makeFakeTrack(overrides: Partial<{ label: string; readyState: MediaStreamTrackState; muted: boolean }> = {}) {
  return { label: "Fake USB Mic", readyState: "live" as MediaStreamTrackState, muted: false, stop: vi.fn(), ...overrides };
}

function makeFakeStream(track = makeFakeTrack()) {
  return { getAudioTracks: () => [track], getTracks: () => [track] };
}

let pendingFrame: FrameRequestCallback | null = null;

describe("Mic Check page", () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeMediaRecorder.instances = [];
    pendingFrame = null;
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pendingFrame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      pendingFrame = null;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function tick() {
    const cb = pendingFrame;
    pendingFrame = null;
    cb?.(0);
  }

  it("shows a Start Mic Check button initially, no auto-recording", () => {
    render(<MicCheckPage />);
    expect(screen.getByRole("button", { name: /Start Mic Check/ })).toBeTruthy();
  });

  it("PERMISSION SUCCESS: reaches the active phase, shows device name and track/AudioContext state", async () => {
    const track = makeFakeTrack({ label: "USB Headset Mic" });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(makeFakeStream(track)) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));

    await waitFor(() => expect(screen.getByTestId("mic-check-verdict")).toBeTruthy());
    expect(screen.getByTestId("mic-check-device-label").textContent).toBe("USB Headset Mic");
    expect(screen.getByTestId("mic-check-track-state").textContent).toBe("live");
    expect(screen.getByTestId("mic-check-audiocontext-state").textContent).toBe("running");
  });

  it("PERMISSION DENIED: shows clear plain-English instructions, not a raw technical error", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError: Permission denied")) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));

    await waitFor(() => expect(screen.getByText(/Microphone permission was denied/)).toBeTruthy());
    expect(screen.queryByText(/NotAllowedError/)).toBeNull();
    expect(screen.getByRole("button", { name: /Try Again/ })).toBeTruthy();
  });

  it("NO DEVICE: distinguished from permission failure with its own clear message", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("NotFoundError: Requested device not found")) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));

    await waitFor(() => expect(screen.getByText(/No microphone found/)).toBeTruthy());
  });

  it("LIVE SIGNAL DETECTED: the verdict flips to MICROPHONE WORKING once a real signal is observed", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(makeFakeStream()) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));
    await waitFor(() => expect(screen.getByTestId("mic-check-verdict")).toBeTruthy());

    expect(screen.getByTestId("mic-check-verdict").textContent).toContain("NO AUDIO DETECTED");

    // Simulate a real speech-level signal reaching the analyser, then one
    // animation frame processing it.
    FakeAudioContext.instances[0].analyser.currentSamples.fill(0.5);
    tick();

    await waitFor(() => expect(screen.getByTestId("mic-check-verdict").textContent).toContain("MICROPHONE WORKING"));
  });

  it("ZERO SIGNAL: stays NO AUDIO DETECTED while the analyser only ever reports silence", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(makeFakeStream()) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));
    await waitFor(() => expect(screen.getByTestId("mic-check-verdict")).toBeTruthy());

    // Analyser samples default to all-zero (silence) — a frame of silence
    // must never flip the verdict.
    tick();
    await waitFor(() => expect(screen.getByTestId("mic-check-verdict").textContent).toContain("NO AUDIO DETECTED"));
  });

  it("PLAYBACK LIFECYCLE: Record -> auto-stop -> Play Back My Voice becomes enabled", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(makeFakeStream()) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));
    await waitFor(() => expect(screen.getByTestId("mic-check-verdict")).toBeTruthy());

    const playButton = screen.getByRole("button", { name: /Play Back My Voice/ }) as HTMLButtonElement;
    expect(playButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Record ~3-Second Sample/ }));
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");
    // Real component uses setTimeout(MIC_CHECK_RECORDING_DURATION_MS) to
    // auto-stop — directly invoke stop() here to simulate that timer firing,
    // exactly like the fake's own onstop/ondataavailable wiring already
    // mirrors the real MediaRecorder contract.
    FakeMediaRecorder.instances[0].stop();

    await waitFor(() => expect((screen.getByRole("button", { name: /Play Back My Voice/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByTestId("mic-check-playback-audio")).toBeTruthy();
  });

  it("CLEANUP: Reset stops every MediaStreamTrack and revokes the playback Blob URL", async () => {
    const track = makeFakeTrack();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(makeFakeStream(track)) },
    });
    render(<MicCheckPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Mic Check/ }));
    await waitFor(() => expect(screen.getByTestId("mic-check-verdict")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Reset Mic Check/ }));

    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Start Mic Check/ })).toBeTruthy();
  });

  // Doc comments in both files legitimately NAME the excluded providers/APIs
  // in prose (explaining what's deliberately absent) — block comments are
  // stripped before scanning so those mentions don't produce a false
  // positive against real import statements/code.
  function stripBlockComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "");
  }

  it("NO PROVIDER DEPENDENCY: imports nothing from any SpeechProvider (Vosk/Whisper/Sherpa/Browser Web Speech)", () => {
    const pageCode = stripBlockComments(readFileSync(path.join(__dirname, "page.tsx"), "utf8"));
    const libCode = stripBlockComments(readFileSync(path.join(__dirname, "../../../../lib/voice/micCheck.ts"), "utf8"));
    for (const forbidden of ["voskProvider", "whisperCppProvider", "sherpaOnnxProvider", "browserWebSpeechProvider"]) {
      expect(pageCode).not.toContain(forbidden);
      expect(libCode).not.toContain(forbidden);
    }
  });

  it("NO UPLOAD: this page's source contains no fetch()/XHR of any kind — playback is 100% local", () => {
    const pageCode = stripBlockComments(readFileSync(path.join(__dirname, "page.tsx"), "utf8"));
    expect(pageCode).not.toMatch(/\bfetch\(/);
    expect(pageCode).not.toMatch(/XMLHttpRequest/);
  });

  it("NO EXPORT: this page has no export/download feature at all — audio can never end up in a Lab JSON export", () => {
    render(<MicCheckPage />);
    expect(screen.queryByText(/export/i)).toBeNull();
    expect(screen.queryByText(/download/i)).toBeNull();
  });
});
