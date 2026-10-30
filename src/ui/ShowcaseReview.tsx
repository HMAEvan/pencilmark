import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { replayShowcase, showcaseNamed } from "../showcase/showcase";
import { loadDerivedSession } from "../session/sessions";
import { ReviewPage, type Shown } from "./Review";
import { RichText } from "./RichText";

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

  return (
    <ReviewPage shown={shown} banner={<p class="card showcase-banner">{t("showcase.banner")}</p>}>
      {feedback && (
        <section class="card">
          <h2>{t("showcase.feedbackHeading")}</h2>
          <p class="muted">
            {t("showcase.feedbackLabel", { model: feedback.label.model, version: feedback.label.gradingSkillVersion, date: feedback.label.date })}
            {feedback.label.conversationUrl && (
              <>
                {" · "}
                <a href={feedback.label.conversationUrl} target="_blank" rel="noopener noreferrer">
                  {t("showcase.conversationLink")}
                </a>
              </>
            )}
          </p>
          <RichText source={feedback.text} />
        </section>
      )}
    </ReviewPage>
  );
}
