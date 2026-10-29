import { DEFAULT_PREFERENCES, type TimePrecision } from "../domain/settings";
import type { Session } from "../domain/types";

/** A duration as mm:ss, or h:mm:ss from an hour; with milliseconds, mm:ss.SSS. */
export function formatDuration(ms: number, precision: TimePrecision = "seconds"): string {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const fraction = precision === "milliseconds" ? `.${String(Math.floor(ms) % 1000).padStart(3, "0")}` : "";
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${mm}:${ss}${fraction}` : `${mm}:${ss}${fraction}`;
}

/** A display preference: it changes what is shown, never what is stored. Snapshots from before it existed use the default. */
export function timePrecisionOf(session: Session): TimePrecision {
  return session.settings?.display.timePrecision ?? DEFAULT_PREFERENCES.display.timePrecision;
}

/** A score to at most two decimal places: "2.5", "0.33". */
export function formatScore(score: number): string {
  return String(Math.round(score * 100) / 100);
}
