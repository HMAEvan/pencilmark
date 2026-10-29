import { DEFAULT_PREFERENCES, type Display, type TimePrecision } from "../domain/settings";
import type { Session } from "../domain/types";

/** A duration as mm:ss, or h:mm:ss from an hour; with milliseconds, mm:ss.SSS. */
export function formatDuration(ms: number, precision: TimePrecision = "seconds"): string {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const fraction = precision === "milliseconds" ? `.${String(Math.floor(ms) % 1000).padStart(3, "0")}` : "";
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${mm}:${ss}${fraction}` : `${mm}:${ss}${fraction}`;
}

/** Display preferences change what is shown, never what is stored. Sessions from before snapshots were kept used the defaults. */
export function displayOf(session: Session): Display {
  return session.settings?.display ?? DEFAULT_PREFERENCES.display;
}

/** Snapshots from before the time-precision preference existed use the default. */
export function timePrecisionOf(session: Session): TimePrecision {
  return displayOf(session).timePrecision ?? DEFAULT_PREFERENCES.display.timePrecision;
}

/** A score to at most two decimal places: "2.5", "0.33". */
export function formatScore(score: number): string {
  return String(Math.round(score * 100) / 100);
}
