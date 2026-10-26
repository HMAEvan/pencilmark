import { useRef, useState } from "preact/hooks";
import { t, type TranslationKey } from "../i18n/i18n";
import { commitImport, packErrorsText, parseQuestionPack, previewImport, type ImportPreview, type PackError } from "../importer/importer";
import { storage } from "./appStorage";

function locatedLine(error: PackError): string {
  const question = error.question ?? t("import.packLevel");
  const location = error.field ? t("import.errorLocation", { question, field: error.field }) : question;
  // `message` is the Importer's English text, written for the AI that will fix the pack.
  return t("import.errorLine", { location, message: error.message });
}

function Errors({ errors }: { errors: PackError[] }) {
  const [copyState, setCopyState] = useState<TranslationKey>();
  const text = packErrorsText(errors);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("import.copied");
    } catch {
      setCopyState("import.copyFailed");
    }
  };
  return (
    <div class="errors">
      <p>{t("import.errorsHeading")}</p>
      <ul>
        {errors.map((error, i) => (
          <li key={i}>{locatedLine(error)}</li>
        ))}
      </ul>
      <div class="actions">
        <button type="button" class="secondary" onClick={copy}>
          {t("import.copyErrors")}
        </button>
        {copyState && <span class="muted">{t(copyState)}</span>}
      </div>
      {copyState === "import.copyFailed" && <textarea readOnly rows={6} value={text} ref={(el) => el?.select()} />}
    </div>
  );
}

function Preview({ preview, onConfirm, onCancel }: { preview: ImportPreview; onConfirm: () => void; onCancel: () => void }) {
  const count = (status: string) => preview.questions.filter((q) => q.status === status).length;
  const labels = (status: string) => preview.questions.filter((q) => q.status === status).map((q) => q.label).join(t("import.listSeparator"));
  return (
    <div class="confirm" role="alertdialog" aria-label={t("import.previewHeading")}>
      <h3>{t("import.previewHeading")}</h3>
      <p>{t("import.previewCounts", { title: preview.pack.batch.title, new: count("new"), skipped: count("skipped"), conflict: count("conflict") })}</p>
      {count("skipped") > 0 && <p class="muted">{t("import.skippedList", { labels: labels("skipped") })}</p>}
      {count("conflict") > 0 && <p class="muted">{t("import.conflictList", { labels: labels("conflict") })}</p>}
      {preview.warnings.length > 0 && (
        <div class="warnings">
          <p>{t("import.warningsHeading")}</p>
          <ul>
            {preview.warnings.map((warning, i) => (
              <li key={i}>{locatedLine(warning)}</li>
            ))}
          </ul>
        </div>
      )}
      {preview.newTopicPaths.length > 0 && (
        <div>
          <p>{t("import.newTopicsHeading")}</p>
          <ul>
            {preview.newTopicPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      )}
      <div class="actions">
        <button type="button" onClick={onConfirm}>
          {preview.newTopicPaths.length ? t("import.confirmWithTopics") : t("import.confirm")}
        </button>
        <button type="button" class="secondary" onClick={onCancel}>
          {t("player.cancel")}
        </button>
      </div>
    </div>
  );
}

export function ImportForm({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<PackError[]>([]);
  const [preview, setPreview] = useState<ImportPreview>();
  const [imported, setImported] = useState<string>();
  // A ref, not state: two clicks can land before a re-render and would import twice.
  const committing = useRef(false);

  const check = async (e: Event) => {
    e.preventDefault();
    setImported(undefined);
    setPreview(undefined);
    const parsed = parseQuestionPack(text);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors([]);
    setPreview(await previewImport(parsed.pack, storage));
  };

  const confirm = async () => {
    if (!preview || committing.current) return;
    committing.current = true;
    try {
      // Showing the new Topic paths and confirming here is the user's confirmation of them.
      await commitImport(preview, storage, { newTopicsConfirmed: true });
      setText("");
      setPreview(undefined);
      setImported(preview.pack.batch.title);
      onImported();
    } finally {
      committing.current = false;
    }
  };

  const pickFile = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) setText(await file.text());
    setPreview(undefined);
  };

  return (
    <form class="card" onSubmit={check}>
      <h2>{t("import.heading")}</h2>
      <textarea
        rows={6}
        value={text}
        placeholder={t("import.placeholder")}
        onInput={(e) => {
          setText(e.currentTarget.value);
          setPreview(undefined);
        }}
      />
      <div class="actions">
        <button type="submit" disabled={!text.trim() || preview !== undefined}>
          {t("import.submit")}
        </button>
        <label class="file">
          {t("import.pickFile")}
          <input type="file" accept=".json,.txt,.md,application/json,text/plain" onChange={pickFile} />
        </label>
      </div>
      {imported && <p class="ok">{t("import.success", { title: imported })}</p>}
      {errors.length > 0 && <Errors errors={errors} />}
      {preview && <Preview preview={preview} onConfirm={confirm} onCancel={() => setPreview(undefined)} />}
    </form>
  );
}
