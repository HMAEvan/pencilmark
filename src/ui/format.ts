/** A duration as mm:ss, or h:mm:ss from an hour. */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}
