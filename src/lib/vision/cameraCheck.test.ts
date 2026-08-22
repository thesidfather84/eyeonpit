import { describe, expect, it } from "vitest";
import {
  classifyCameraPermissionError,
  formatResolution,
  listVideoInputDevices,
} from "./cameraCheck";

describe("classifyCameraPermissionError", () => {
  it("classifies NotAllowedError/SecurityError as permission-denied", () => {
    expect(classifyCameraPermissionError("NotAllowedError: Permission denied")).toBe("permission-denied");
    expect(classifyCameraPermissionError("SecurityError: blocked")).toBe("permission-denied");
  });

  it("classifies NotFoundError/OverconstrainedError as no-device", () => {
    expect(classifyCameraPermissionError("NotFoundError: Requested device not found")).toBe("no-device");
    expect(classifyCameraPermissionError("OverconstrainedError: constraint not satisfied")).toBe("no-device");
  });

  it("falls back to other for anything unrecognized", () => {
    expect(classifyCameraPermissionError("AbortError: something else")).toBe("other");
  });
});

describe("formatResolution", () => {
  it("formats known dimensions with a multiplication sign", () => {
    expect(formatResolution(1280, 720)).toBe("1280 × 720");
  });

  it("returns null when either dimension is missing or zero, never a misleading 0 × 0", () => {
    expect(formatResolution(undefined, 720)).toBeNull();
    expect(formatResolution(1280, undefined)).toBeNull();
    expect(formatResolution(0, 0)).toBeNull();
  });
});

describe("listVideoInputDevices", () => {
  it("filters to only videoinput kind, preserving browser order", () => {
    const devices = [
      { kind: "audioinput", deviceId: "a1", label: "Mic" },
      { kind: "videoinput", deviceId: "v1", label: "Front Camera" },
      { kind: "videoinput", deviceId: "v2", label: "Back Camera" },
      { kind: "audiooutput", deviceId: "o1", label: "Speaker" },
    ] as MediaDeviceInfo[];

    expect(listVideoInputDevices(devices)).toEqual([
      { deviceId: "v1", label: "Front Camera" },
      { deviceId: "v2", label: "Back Camera" },
    ]);
  });

  it("falls back to a generic numbered label when the browser withholds the device label (no permission granted yet)", () => {
    const devices = [
      { kind: "videoinput", deviceId: "v1", label: "" },
      { kind: "videoinput", deviceId: "v2", label: "" },
    ] as MediaDeviceInfo[];

    expect(listVideoInputDevices(devices)).toEqual([
      { deviceId: "v1", label: "Camera 1" },
      { deviceId: "v2", label: "Camera 2" },
    ]);
  });
});
