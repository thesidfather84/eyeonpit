// @vitest-environment jsdom
//
// Real component test for the Vision Lab page. jsdom has no real
// getUserMedia/enumerateDevices/<video>.play() implementation (same
// disclosed boundary mic-check/page.test.tsx's own doc comment uses), so
// this file provides small, controllable fakes for exactly those APIs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VisionLabPage from "./page";

function makeFakeTrack(overrides: Partial<{ label: string; readyState: MediaStreamTrackState; muted: boolean }> = {}) {
  return {
    label: "Fake Back Camera",
    readyState: "live" as MediaStreamTrackState,
    muted: false,
    stop: vi.fn(),
    getSettings: () => ({ width: 1280, height: 720, deviceId: "cam-1" }),
    ...overrides,
  };
}

function makeFakeStream(track = makeFakeTrack()) {
  return { getVideoTracks: () => [track], getTracks: () => [track] };
}

describe("Vision Lab page", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake-image"), revokeObjectURL: vi.fn() });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // @ts-expect-error -- cleaning up the per-test mediaDevices stub
    delete navigator.mediaDevices;
  });

  it("shows a Start Camera button initially, no auto-request of permission", () => {
    render(<VisionLabPage />);
    expect(screen.getByRole("button", { name: /Start Camera/ })).toBeTruthy();
  });

  it("PERMISSION SUCCESS: reaches the active phase, shows device name/resolution/track state", async () => {
    const track = makeFakeTrack({ label: "iPhone Back Camera" });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(makeFakeStream(track)),
        enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "cam-1", label: "iPhone Back Camera" }]),
      },
    });
    render(<VisionLabPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/ }));

    await waitFor(() => expect(screen.getByTestId("vision-camera-status")).toBeTruthy());
    expect(screen.getByTestId("vision-camera-device-label").textContent).toBe("iPhone Back Camera");
    expect(screen.getByTestId("vision-camera-resolution").textContent).toBe("1280 × 720");
    expect(screen.getByTestId("vision-camera-stream-state").textContent).toBe("live");
  });

  it("PERMISSION DENIED: shows clear plain-English instructions, not a raw technical error", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError: Permission denied")) },
    });
    render(<VisionLabPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/ }));

    await waitFor(() => expect(screen.getByText(/Camera permission was denied/)).toBeTruthy());
    expect(screen.queryByText(/NotAllowedError/)).toBeNull();
    expect(screen.getByRole("button", { name: /Try Again/ })).toBeTruthy();
  });

  it("NO DEVICE: distinguished from permission failure with its own clear message", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("NotFoundError: Requested device not found")) },
    });
    render(<VisionLabPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/ }));

    await waitFor(() => expect(screen.getByText(/No camera found/)).toBeTruthy());
  });

  it("STOP: releases every MediaStreamTrack and returns to the idle Start Camera state", async () => {
    const track = makeFakeTrack();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(makeFakeStream(track)),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    render(<VisionLabPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/ }));
    await waitFor(() => expect(screen.getByTestId("vision-camera-status")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Stop Camera/ }));

    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Start Camera/ })).toBeTruthy();
  });

  it("CLEANUP ON UNMOUNT: releases every MediaStreamTrack even without an explicit Stop tap", async () => {
    const track = makeFakeTrack();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(makeFakeStream(track)),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    const { unmount } = render(<VisionLabPage />);
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/ }));
    await waitFor(() => expect(screen.getByTestId("vision-camera-status")).toBeTruthy());

    unmount();

    expect(track.stop).toHaveBeenCalled();
  });

  it("STILL-IMAGE: selecting a local file shows a local preview, never a network request", async () => {
    render(<VisionLabPage />);
    const file = new File(["fake-bytes"], "cards.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("vision-test-image-input") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId("vision-test-image-preview")).toBeTruthy());
    const img = screen.getByTestId("vision-test-image-preview") as HTMLImageElement;
    expect(img.src).toContain("blob:fake-image");
  });

  it("RUN DETECTION (still image): the pipeline runs end-to-end and honestly reports no model is integrated", async () => {
    render(<VisionLabPage />);
    const file = new File(["fake-bytes"], "cards.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("vision-test-image-input"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId("vision-test-image-preview")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Run Detection/ }));

    await waitFor(() => expect(screen.getByText(/No model integrated yet/)).toBeTruthy());
  });

  it("MODEL INFO: states local inference, and the real license situation, honestly — never a fabricated model name", async () => {
    render(<VisionLabPage />);
    const modelInfo = screen.getByTestId("vision-model-info");
    expect(modelInfo.textContent).toContain("Runtime:");
    expect(modelInfo.textContent).toContain("none");
    expect(modelInfo.textContent).toContain("LOCAL");
    expect(modelInfo.textContent).toContain("n/a — no model integrated");
  });

  it("DIAGNOSTICS: shows a not-yet-measured state before any detection has run", () => {
    render(<VisionLabPage />);
    const diagnostics = screen.getByTestId("vision-diagnostics");
    expect(diagnostics.textContent).toContain("not loaded yet");
    expect(diagnostics.textContent).toContain("run detection first");
  });

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  it("NO UPLOAD: this page's source contains no fetch()/XHR of any kind — camera and image stay local", () => {
    const pageCode = stripComments(readFileSync(path.join(__dirname, "page.tsx"), "utf8"));
    expect(pageCode).not.toMatch(/\bfetch\(/);
    expect(pageCode).not.toMatch(/XMLHttpRequest/);
  });

  it("NO INVESTIGATION ACCESS: this page never imports InvestigationContext or the investigation/CardEvent repositories", () => {
    const pageCode = stripComments(readFileSync(path.join(__dirname, "page.tsx"), "utf8"));
    for (const forbidden of ["InvestigationContext", "db/repositories/investigations", "db/repositories/cardEvents"]) {
      expect(pageCode).not.toContain(forbidden);
    }
  });
});
