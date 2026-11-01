import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { replayShowcase, showcaseNamed } from "../showcase/showcase";
import { loadDerivedSession } from "../session/sessions";
import { FEEDBACK_ID, ReviewPage, type Shown } from "./Review";
import { RichText } from "./RichText";
import { PackImportButton } from "./ImportForm";
import { navigate } from "./App";

/** The Feedback's first and last sections, by their `## ` headings; the first only when there are fewer than two. */
function conclusionSections(text: string): string[] {
  const sections = text.split(/^(?=## )/m).filter((section) => section.startsWith("## "));
  return sections.length < 2 ? sections.slice(0, 1) : [sections[0]!, sections.at(-1)!];
}

/**
 * A Showcase's review page: its script replayed into a Storage of its own in memory, never the user's, shown read-only.
 * A reload replays it again from the start.
 */
export function ShowcaseReview({ name }: { name: string }) {
  const showcase = showcaseNamed(name);
  const [shown, setShown] = useState<Shown | null>();
  useEffect(() => {
    if (!showcase) return setShown(null);
    void replayShowcase(showcase)
      .then(({ storage, sessionId }) => loadDerivedSession(storage, sessionId))
      .then((derived) => setShown(derived ? { ...derived, questions: new Map(derived.questions.map((q) => [q.id, q])) } : null))
      .catch((e: unknown) => {
        console.error(`Replaying Showcase ${name} failed`, e);
        setShown(null);
      });
  }, [name]);

  if (shown === undefined) return <main>{t("common.loading")}</main>;
  if (shown === null || !showcase) return <main>{t("common.notFound")}</main>;
  const { feedback } = showcase;
  const labelLine = feedback && (
    <>
      {t("showcase.feedbackLabel", { model: feedback.label.model, version: feedback.label.gradingSkillVersion, date: feedback.label.date })}
      {feedback.label.conversationUrl && (
        <>
          {" · "}
          <a href={feedback.label.conversationUrl} target="_blank" rel="noopener noreferrer">
            {t("showcase.conversationLink")}
          </a>
        </>
      )}
    </>
  );

  return (
    <ReviewPage shown={shown} banner={
        <>
          <p class="card showcase-banner">{t("showcase.banner")}</p>
          <section class="card">
            {feedback && (
              <>
                <h2>{t("showcase.cardHeading")}</h2>
                <p class="muted">{labelLine}</p>
                {conclusionSections(feedback.text).map((section) => (
                  <RichText key={section} source={section} />
                ))}
              </>
            )}
            <div class="actions">
              {feedback && (
                <button type="button" onClick={() => document.getElementById(FEEDBACK_ID)?.scrollIntoView({ block: "start" })}>
                  {t("showcase.readFull")}
                </button>
              )}
              <PackImportButton pack={showcase.pack} label="showcase.sitYourself" onImported={() => navigate()} />
            </div>
          </section>
        </>
      } feedbackLink={!!feedback}>
      {feedback && (
        <section class="card" id={FEEDBACK_ID}>
          <h2>{t("showcase.feedbackHeading")}</h2>
          <p class="muted">{labelLine}</p>
          <RichText source={feedback.text} />
        </section>
      )}
    </ReviewPage>
  );
}
