import { letterOf } from "../domain/display";
import type { TimePrecision } from "../domain/settings";
import type { TimelineStep } from "../derivation/timeline";
import { t } from "../i18n/i18n";
import { answerText, formatDuration } from "./format";

/**
 * Everything done on the Question while answering, in order, each at the answering time spent on it so far.
 * The same steps as the Digest's Answering timeline lines.
 */
export function AnsweringTimeline({ timeline, optionOrder, precision }: { timeline: TimelineStep[]; optionOrder: string[]; precision: TimePrecision }) {
  let visits = 0;
  const describe = (step: TimelineStep): string => {
    switch (step.kind) {
      case "open":
        return t("timeline.open", { n: ++visits });
      case "leave":
        return t("timeline.leave", { n: visits });
      case "select":
      case "deselect":
        return t(step.kind === "select" ? "timeline.select" : "timeline.deselect", { letter: letterOf(step.optionId, optionOrder), answer: answerText(step.answer, optionOrder) });
      case "itemFlag":
      case "itemUnflag":
        return t(step.kind === "itemFlag" ? "timeline.itemFlag" : "timeline.itemUnflag", { letter: letterOf(step.optionId, optionOrder), itemFlag: t(`itemFlag.${step.itemFlag}`) });
      case "openHint":
        return t("timeline.openHint", { n: step.level + 1 });
      case "confidence":
        return step.confidence ? t("timeline.confidence", { confidence: t(`confidence.${step.confidence}`) }) : t("timeline.confidenceCleared");
      case "flag":
      case "unflag":
        return t(step.kind === "flag" ? "timeline.flag" : "timeline.unflag", { flag: t(`flag.${step.flag}`) });
      case "appeal":
        return t("timeline.appeal", { reason: step.reason });
      case "note":
        return step.text ? t("timeline.note", { note: step.text }) : t("timeline.noteCleared");
    }
  };
  return (
    <div class="timeline">
      <h4>{t("timeline.heading")}</h4>
      {timeline.length ? (
        <ol>
          {timeline.map((step, i) => (
            <li key={i}>
              <span class="timeline-time">{formatDuration(step.atMs, precision)}</span> {describe(step)}
            </li>
          ))}
        </ol>
      ) : (
        <p class="muted">{t("timeline.none")}</p>
      )}
    </div>
  );
}
