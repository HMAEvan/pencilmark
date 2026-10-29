import { useEffect, useRef, useState } from "preact/hooks";
import type { QuestionSet, Session } from "../domain/types";
import { t } from "../i18n/i18n";
import { abandonSession, latestSession, startSession } from "../session/sessions";
import { storage } from "./appStorage";
import { navigate } from "./App";
import { ImportForm } from "./ImportForm";
import { Dialog } from "./Dialog";

type SetRow = { set: QuestionSet; latest?: Session };

/** `anySets` counts archived Sets too: the sample is offered only to a tool that has never had a Set. */
async function loadRows(): Promise<{ rows: SetRow[]; anySets: boolean }> {
  const all = await storage.query<QuestionSet>("sets");
  const sets = all.filter((set) => !set.archived).sort((a, b) => b.createdAt - a.createdAt);
  const rows = await Promise.all(sets.map(async (set) => ({ set, latest: await latestSession(storage, set.id) })));
  return { rows, anySets: all.length > 0 };
}

export function Home() {
  const [rows, setRows] = useState<SetRow[]>();
  const [anySets, setAnySets] = useState(true);
  const refresh = () =>
    void loadRows().then((loaded) => {
      setRows(loaded.rows);
      setAnySets(loaded.anySets);
    });
  useEffect(refresh, []);

  const [confirmingAbandon, setConfirmingAbandon] = useState<string>();
  // The ref, not state, guards: two clicks can land before a re-render and would start two Sessions.
  const starting = useRef(false);
  const once = async (action: () => Promise<void>) => {
    if (starting.current) return;
    starting.current = true;
    try {
      await action();
    } finally {
      starting.current = false;
    }
  };
  const start = (set: QuestionSet) => once(async () => navigate("session", (await startSession(storage, set)).id));
  const restart = (set: QuestionSet, session: Session) =>
    once(async () => {
      await abandonSession(storage, session);
      navigate("session", (await startSession(storage, set)).id);
    });

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <ImportForm onImported={refresh} offerSample={!anySets} />
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
            <Dialog label={t("home.confirmAbandon")} onCancel={() => setConfirmingAbandon(undefined)}>
              <p>{t("home.confirmAbandon")}</p>
              <div class="actions">
                <button onClick={() => restart(set, latest)}>{t("home.confirmAbandonYes")}</button>
                <button class="secondary" onClick={() => setConfirmingAbandon(undefined)}>
                  {t("player.cancel")}
                </button>
              </div>
            </Dialog>
          )}
        </section>
      ))}
    </main>
  );
}
