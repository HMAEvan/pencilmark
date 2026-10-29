import { DEFAULT_PREFERENCES, type Display, type TimePrecision } from "../domain/settings";
import type { Session } from "../domain/types";
import { t, type TranslationKey } from "../i18n/i18n";

const MONTHS: TranslationKey[] = [
  "date.month.jan",
  "date.month.feb",
  "date.month.mar",
  "date.month.apr",
  "date.month.may",
  "date.month.jun",
  "date.month.jul",
  "date.month.aug",
  "date.month.sep",
  "date.month.oct",
  "date.month.nov",
  "date.month.dec",
];

/** Minutes east of GMT at that moment in the viewer's time zone. */
const offsetAt = (date: Date) => -date.getTimezoneOffset();

/** "+0", "+1", "-5", "+5:30". */
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return rest ? `${sign}${hours}:${String(rest).padStart(2, "0")}` : `${sign}${hours}`;
}

/**
 * Every date-time shown: "29 Oct 2026 14:03:27 GMT+0", in the viewer's current time zone, to the second.
 * The zone is a GMT offset, never an abbreviation; it is summer time when the offset is larger than the smaller of
 * that year's January and July offsets, so no zone names are needed. The order and words are translation keys.
 */
export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const offset = offsetAt(date);
  const standard = Math.min(offsetAt(new Date(year, 0, 1)), offsetAt(new Date(year, 6, 1)));
  const two = (n: number) => String(n).padStart(2, "0");
  return t("date.dateTime", {
    day: date.getDate(),
    month: t(MONTHS[date.getMonth()]!),
    monthNumber: date.getMonth() + 1,
    year,
    time: `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`,
    offset: formatOffset(offset),
    summer: offset > standard ? t("date.summerTime") : "",
  });
}

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
