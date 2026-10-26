import { useEffect, useState } from "preact/hooks";
import type { QuestionSet, Session } from "../domain/types";
import { t } from "../i18n/i18n";
import { commitQuestionPack, parseQuestionPack, type PackError } from "../importer/importer";
import { abandonSession, latestSession, startSession } from "../session/sessions";
import { storage } from "./appStorage";
import { navigate } from "./App";

type SetRow = { set: QuestionSet; latest?: Session };

async function loadRows(): Promise<SetRow[]> {
  const sets = await storage.query<QuestionSet>("sets", { archived: false });
  sets.sort((a, b) => b.createdAt - a.createdAt);
  return Promise.all(sets.map(async (set) => ({ set, latest: await latestSession(storage, set.id) })));
}

function errorLine(error: PackError): string {
  const question = error.question ?? t("import.packLevel");
  const location = error.field ? t("import.errorLocation", { question, field: error.field }) : question;
  // `message` is the Importer's English text, written for the AI that will fix the pack.
  return t("import.errorLine", { location, message: error.message });
}

function ImportForm({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<PackError[]>([]);
  const [imported, setImported] = useState<string>();

  const submit = async (e: Event) => {
    e.preventDefault();
    setImported(undefined);
    const parsed = parseQuestionPack(text);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors([]);
    await commitQuestionPack(parsed.pack, storage);
    setText("");
    setImported(parsed.pack.batch.title);
    onImported();
  };

  return (
    <form class="card" onSubmit={submit}>
      <h2>{t("import.heading")}</h2>
      <textarea rows={6} value={text} placeholder={t("import.placeholder")} onInput={(e) => setText(e.currentTarget.value)} />
      <button type="submit" disabled={!text.trim()}>
        {t("import.submit")}
      </button>
      {imported && <p class="ok">{t("import.success", { title: imported })}</p>}
      {errors.length > 0 && (
        <div class="errors">
          <p>{t("import.errorsHeading")}</p>
          <ul>
            {errors.map((error, i) => (
              <li key={i}>{errorLine(error)}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

export function Home() {
  const [rows, setRows] = useState<SetRow[]>();
  const refresh = () => void loadRows().then(setRows);
  useEffect(refresh, []);

  const [confirmingAbandon, setConfirmingAbandon] = useState<string>();
  const start = async (set: QuestionSet) => navigate("session", (await startSession(storage, set)).id);
  const restart = async (set: QuestionSet, session: Session) => {
    await abandonSession(storage, session);
    await start(set);
  };

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <ImportForm onImported={refresh} />
      <h2>{t("home.setsHeading")}</h2>
      {!rows && <p>{t("common.loading")}</p>}
      {rows?.length === 0 && <p class="muted">{t("home.noSets")}</p>}
      {rows?.map(({ set, latest }) => (
        <section class="card set" key={set.id}>
          <h3>{set.title}</h3>
          <p class="muted">
            {t("home.questionCount", { count: set.entries.length })}
            {latest && ` · ${t("home.latestSession", { status: t(`session.status.${latest.status}`) })}`}
          </p>
          <div class="actions">
            <button onClick={() => start(set)}>{latest?.status === "in_progress" ? t("home.continue") : t("home.start")}</button>
            {latest?.status === "in_progress" && (
              <button class="secondary" disabled={confirmingAbandon === set.id} onClick={() => setConfirmingAbandon(set.id)}>
                {t("home.abandonAndRestart")}
              </button>
            )}
            {latest?.currentDerivationId && (
              <button class="secondary" onClick={() => navigate("review", latest.id)}>
                {t("home.viewReview")}
              </button>
            )}
          </div>
          {latest?.status === "in_progress" && confirmingAbandon === set.id && (
            <div class="confirm" role="alertdialog" aria-label={t("home.confirmAbandon")}>
              <p>{t("home.confirmAbandon")}</p>
              <div class="actions">
                <button onClick={() => restart(set, latest)}>{t("home.confirmAbandonYes")}</button>
                <button class="secondary" onClick={() => setConfirmingAbandon(undefined)}>
                  {t("player.cancel")}
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
