import { describe, expect, it } from "vitest";
import {
  classifyMicPermissionError,
  computePeak,
  computeRms,
  isSignalDetected,
  MIC_CHECK_NO_DEVICE_INSTRUCTIONS,
  MIC_CHECK_PERMISSION_DENIED_INSTRUCTIONS,
  MIC_CHECK_SIGNAL_PEAK_THRESHOLD,
} from "./micCheck";

describe("computePeak / computeRms — pure signal-level math", () => {
  it("computes zero for silence", () => {
    const silence = new Float32Array(100);
    expect(computePeak(silence)).toBe(0);
    expect(computeRms(silence)).toBe(0);
  });

  it("computes real peak/RMS for a non-trivial signal", () => {
    const samples = new Float32Array([0.1, -0.5, 0.3, -0.2]);
    expect(computePeak(samples)).toBe(0.5);
    expect(computeRms(samples)).toBeCloseTo(Math.sqrt((0.01 + 0.25 + 0.09 + 0.04) / 4), 6);
  });

  it("handles an empty buffer without throwing", () => {
    expect(computePeak(new Float32Array(0))).toBe(0);
    expect(computeRms(new Float32Array(0))).toBe(0);
  });
});

describe("isSignalDetected — zero signal vs. live signal", () => {
  it("is false for a peak below the documented threshold (silence/noise floor)", () => {
    expect(isSignalDetected(0)).toBe(false);
    expect(isSignalDetected(MIC_CHECK_SIGNAL_PEAK_THRESHOLD - 0.001)).toBe(false);
  });

  it("is true at or above the threshold (real speech-level signal)", () => {
    expect(isSignalDetected(MIC_CHECK_SIGNAL_PEAK_THRESHOLD)).toBe(true);
    expect(isSignalDetected(0.5)).toBe(true);
  });
});

describe("classifyMicPermissionError — permission failure vs. no-device vs. other, never a raw technical error shown to the operator", () => {
  it("classifies a real NotAllowedError as permission-denied", () => {
    expect(classifyMicPermissionError("NotAllowedError: Permission denied")).toBe("permission-denied");
  });

  it("classifies a real NotFoundError as no-device", () => {
    expect(classifyMicPermissionError("NotFoundError: Requested device not found")).toBe("no-device");
  });

  it("classifies an unrecognized error as other, never silently mislabeled", () => {
    expect(classifyMicPermissionError("AbortError: something else went wrong")).toBe("other");
  });

  it("permission-denied and no-device instructions are plain English, not technical jargon", () => {
    expect(MIC_CHECK_PERMISSION_DENIED_INSTRUCTIONS).not.toMatch(/NotAllowedError|SecurityError/);
    expect(MIC_CHECK_NO_DEVICE_INSTRUCTIONS).not.toMatch(/NotFoundError/);
  });
});
