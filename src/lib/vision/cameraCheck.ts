/**
 * CAMERA CHECK — pure, provider-independent helpers for the Vision Lab's
 * camera diagnostic (src/app/lab/(protected)/vision/page.tsx), mirroring
 * lib/voice/micCheck.ts's own split of "browser API glue in the page" vs.
 * "pure logic here" for the same testability reasons. Zero dependency on
 * anything in lib/vision/visionTypes.ts or any VisionProvider — this only
 * tests that a MediaStream with a video track can be opened and read, the
 * same "is the hardware/permission itself working" question Mic Check
 * answers for audio.
 */

export type CameraPermissionErrorKind = "permission-denied" | "no-device" | "other";

/** Same three-way classification Mic Check uses for getUserMedia() rejections — see classifyMicPermissionError's own doc comment. */
export function classifyCameraPermissionError(message: string): CameraPermissionErrorKind {
  if (/NotAllowedError|permission denied|permission dismissed|SecurityError/i.test(message)) return "permission-denied";
  if (/NotFoundError|no camera|DevicesNotFoundError|OverconstrainedError/i.test(message)) return "no-device";
  return "other";
}

export const CAMERA_PERMISSION_DENIED_INSTRUCTIONS =
  "Camera access was blocked. Click the camera icon in your browser's address bar (or your device's Settings > Privacy > Camera) and allow access for this site, then try again.";

export const CAMERA_NO_DEVICE_INSTRUCTIONS =
  "No camera was found. Check that a camera is connected (or the built-in camera is enabled) and try again.";

export const CAMERA_OTHER_ERROR_INSTRUCTIONS = "Could not access the camera. Try again, or check your device's camera settings.";

/** "1280x720" -> "1280 × 720". Returns null when either dimension is unavailable/zero, rather than showing a misleading "0 × 0". */
export function formatResolution(width: number | undefined, height: number | undefined): string | null {
  if (!width || !height) return null;
  return `${width} × ${height}`;
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

/** Filters navigator.mediaDevices.enumerateDevices() output down to just the video inputs, in the order the browser reports them. */
export function listVideoInputDevices(devices: MediaDeviceInfo[]): CameraDeviceOption[] {
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}
