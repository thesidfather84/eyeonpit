/** Today's date as "YYYY-MM-DD". Only ever called from a user event handler (never during render) to avoid baking a build-time date into a prerendered page. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
