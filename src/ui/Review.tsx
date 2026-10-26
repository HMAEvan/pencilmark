import { useEffect, useState } from "preact/hooks";
import type { Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import { t, type TranslationKey } from "../i18n/i18n";
import { loadQuestions, type Attempt, type Derivation } from "../session/sessions";
import { storage } from "./appStorage";
import { navigate } from "./App";

type Loaded = { set: QuestionSet; derivation: Derivation; attempts: Attempt[]; questions: Map<string, Question> };

async function load(sessionId: string): Promise<Loaded | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  if (!session?.currentDerivationId) return undefined;
  const set = await storage.get<QuestionSet>("sets", session.setId);
  const derivation = await storage.get<Derivation>("derivations", session.currentDerivationId);
  if (!set || !derivation) return undefined;
  const attempts = await storage.query<Attempt>("attempts", { derivationId: derivation.id });
  attempts.sort((a, b) => a.displayedNumber - b.displayedNumber);
  const questions = new Map((await loadQuestions(storage, set)).map((q) => [q.id, q]));
  return { set, derivation, attempts, questions };
}

function answerText(optionIds: string[], optionOrder: string[]): string {
  return optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).join(", ") : t("review.blank");
}

export function Review({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [copyState, setCopyState] = useState<TranslationKey>();

  useEffect(() => void load(sessionId).then((result) => setLoaded(result ?? null)), [sessionId]);

  if (loaded === undefined) return <main>{t("common.loading")}</main>;
  if (loaded === null) return <main>{t("common.notFound")}</main>;

  const { set, derivation, attempts, questions } = loaded;
  const copyDigest = async () => {
    try {
      await navigator.clipboard.writeText(derivation.digest);
      setCopyState("review.copied");
    } catch {
      setCopyState("review.copyFailed");
    }
  };

  return (
    <main>
      <h1>{t("review.heading", { title: set.title })}</h1>
      <p>{t("review.score", { correct: attempts.filter((a) => a.correct).length, total: attempts.length })}</p>
      <div class="actions">
        <button onClick={copyDigest}>{t("review.copyDigest")}</button>
        <button class="secondary" onClick={() => navigate()}>
          {t("review.backHome")}
        </button>
        {copyState && <span class="muted">{t(copyState)}</span>}
      </div>
      {copyState === "review.copyFailed" && (
        <textarea readOnly rows={10} value={derivation.digest} ref={(el) => el?.select()} />
      )}
      {attempts.map((attempt) => {
        const question = questions.get(attempt.questionId)!;
        const order = attempt.optionOrder;
        return (
          <section class="card" key={attempt.id}>
            <h3>
              {t("review.questionNumber", { n: attempt.displayedNumber })}{" "}
              <span class={attempt.correct ? "ok" : "bad"}>{t(attempt.correct ? "review.correct" : "review.wrong")}</span>
            </h3>
            <p class="stem">{blocksToText(question.stem, order)}</p>
            <div class="options">
              {order.map((optionId, i) => {
                const option = question.options.find((o) => o.id === optionId)!;
                const isAnswer = question.answer.includes(optionId);
                const isChosen = attempt.answer.includes(optionId);
                return (
                  <div key={optionId} class={`option${isAnswer ? " answer" : ""}${isChosen && !isAnswer ? " chosen-wrong" : ""}`}>
                    <span class="letter">{letterAt(i)}</span>
                    <span>{blocksToText(option.content, order)}</span>
                  </div>
                );
              })}
            </div>
            <p>{t("review.answerGiven", { answer: answerText(attempt.answer, order) })}</p>
            <p>{t("review.correctAnswer", { answer: answerText(question.answer, order) })}</p>
            {question.explanation.length > 0 && (
              <details>
                <summary>{t("review.explanation")}</summary>
                <p class="stem">{blocksToText(question.explanation, order)}</p>
              </details>
            )}
          </section>
        );
      })}
    </main>
  );
}
