import { useState } from "preact/hooks";
import { t, type TranslationKey } from "../i18n/i18n";
import type { TimePrecision } from "../domain/settings";
import { finalAnsweringActiveMs, type OverrideValues } from "../derivation/derivation";
import { formatDuration } from "./format";

/**
 * A Question's answering time under `label`. Once overridden, two labelled times instead: the derived time in grey and
 * the overridden time, with any time derived since added on top, in the normal colour.
 */
export function AnsweringTime({ label, derivedMs, override = {}, precision }: { label: TranslationKey; derivedMs: number; override?: OverrideValues; precision: TimePrecision }) {
  if (override.answeringActiveMs === undefined) return <span class="muted">{t(label, { time: formatDuration(derivedMs, precision) })}</span>;
  return (
    <span class="answering-time">
      <span class="muted">{t("time.derived", { time: formatDuration(derivedMs, precision) })}</span>
      <span>{t("time.overridden", { time: formatDuration(finalAnsweringActiveMs(derivedMs, override), precision) })}</span>
    </span>
  );
}

/** Entering an answering time in seconds to save as an Override, or, with `undefined`, going back to the derived time. */
export function TimeOverrideField({ overridden, onSave }: { overridden: boolean; onSave: (ms: number | undefined) => void }) {
  const [seconds, setSeconds] = useState("");
  const enteredMs = Math.round(Number(seconds) * 1000);
  return (
    <div class="actions">
      <label>
        {t("time.overrideLabel")} <input type="number" min="0" step="0.001" inputMode="decimal" value={seconds} onInput={(e) => setSeconds(e.currentTarget.value)} />
      </label>
      <button class="secondary" disabled={seconds === "" || !(enteredMs >= 0)} onClick={() => onSave(enteredMs)}>
        {t("time.save")}
      </button>
      {overridden && (
        <button class="secondary" onClick={() => onSave(undefined)}>
          {t("time.restore")}
        </button>
      )}
    </div>
  );
}
