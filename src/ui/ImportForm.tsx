import { useEffect, useRef, useState } from "preact/hooks";
import { t, type TranslationKey } from "../i18n/i18n";
import {
  commitImport,
  packErrorsText,
  parseQuestionPack,
  previewImport,
  topicPaths,
  type DiffPart,
  type ImportPreview,
  type ImportStatus,
  type OptionComparison,
  type PackError,
  type PreviewQuestion,
  type SimilarChoice,
} from "../importer/importer";
import { questionWritingSkillText } from "../exports/skills";
import samplePack from "../../samples/general-science.json?raw";
import { storage } from "./appStorage";
import { CopyButton } from "./CopyButton";
import { Dialog } from "./Dialog";
import { RichText } from "./RichText";
import { keepFormulasWhole } from "../render/formulaDiff";

function locatedLine(error: PackError): string {
  const question = error.question ?? t("import.packLevel");
  const location = error.field ? t("import.errorLocation", { question, field: error.field }) : question;
  // `message` is the Importer's English text, written for the AI that will fix the pack.
  return t("import.errorLine", { location, message: error.message });
}

function Errors({ errors }: { errors: PackError[] }) {
  return (
    <div class="errors">
      <p>{t("import.errorsHeading")}</p>
      <ul>
        {errors.map((error, i) => (
          <li key={i}>{locatedLine(error)}</li>
        ))}
      </ul>
      <div class="actions">
        <CopyButton label="import.copyErrors" text={() => packErrorsText(errors)} secondary />
      </div>
    </div>
  );
}

/** Matches in green; differences in red, struck through for the existing text and underlined for the incoming text. */
function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <span class="diff">
      {keepFormulasWhole(parts).map((part, i) =>
        part.kind === "removed" ? (
          <del key={i}>
            <RichText source={part.text} inline />
          </del>
        ) : part.kind === "added" ? (
          <ins key={i}>
            <RichText source={part.text} inline />
          </ins>
        ) : (
          <span key={i} class="same">
            <RichText source={part.text} inline />
          </span>
        ),
      )}
    </span>
  );
}

function correctness({ existing, incoming }: OptionComparison): string {
  if (existing.correct !== incoming.correct) return t(incoming.correct ? "import.optionBecomesCorrect" : "import.optionBecomesWrong");
  return incoming.correct ? t("import.optionCorrect") : "";
}

const CHOICES: [SimilarChoice, TranslationKey][] = [
  ["skip", "import.choiceSkip"],
  ["update", "import.choiceUpdate"],
  ["new", "import.choiceNew"],
];

function SimilarQuestion({ shown, choice, onChoose }: { shown: PreviewQuestion; choice?: SimilarChoice; onChoose: (choice: SimilarChoice) => void }) {
  const comparison = shown.comparison!;
  return (
    <fieldset class="similar">
      <legend>{t("import.similarTitle", { label: shown.label, percent: Math.floor(comparison.similarity * 100), revision: shown.existingRevision! })}</legend>
      <p class="stem">
        <span class="muted">{t("import.stemLabel")}: </span>
        <Diff parts={comparison.stem} />
      </p>
      <p class="muted">{t("import.optionsLabel")}:</p>
      <ul>
        {comparison.options.map((option) => {
          const changed = option.existing.correct !== option.incoming.correct;
          return (
            <li key={option.existing.optionId}>
              <Diff parts={option.parts} />
              <span class={changed ? "bad" : "muted"}>{changed ? <strong>{correctness(option)}</strong> : correctness(option)}</span>
            </li>
          );
        })}
      </ul>
      {comparison.hints.map((parts, level) => (
        <p key={level} class="stem">
          <span class="muted">{t("hints.label", { n: level + 1 })}: </span>
          <Diff parts={parts} />
        </p>
      ))}
      <div class="choices">
        {CHOICES.map(([value, label]) => (
          <label key={value}>
            <input type="radio" name={`similar-${shown.label}`} checked={choice === value} onChange={() => onChoose(value)} /> {t(label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Preview({
  preview,
  choices,
  onChoose,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  choices: Record<string, SimilarChoice>;
  onChoose: (label: string, choice: SimilarChoice) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const withStatus = (status: ImportStatus) => preview.questions.filter((q) => q.status === status);
  const count = (status: ImportStatus) => withStatus(status).length;
  const labels = (status: ImportStatus) => withStatus(status).map((q) => q.label).join(t("import.listSeparator"));
  const unchosen = withStatus("similar").some((q) => !choices[q.label]);
  return (
    <Dialog label={t("import.previewHeading")} onCancel={onCancel} wide>
      <h3>{t("import.previewHeading")}</h3>
      <p>
        {t("import.previewCounts", { title: preview.pack.batch.title, new: count("new"), skipped: count("skipped"), similar: count("similar"), conflict: count("conflict") })}
      </p>
      {count("skipped") > 0 && <p class="muted">{t("import.skippedList", { labels: labels("skipped") })}</p>}
      {count("conflict") > 0 && <p class="muted">{t("import.conflictList", { labels: labels("conflict") })}</p>}
      {count("similar") > 0 && (
        <div>
          <p>{t("import.similarHeading")}</p>
          <p class="muted">{t("import.diffLegend")}</p>
          {withStatus("similar").map((q) => (
            <SimilarQuestion key={q.label} shown={q} choice={choices[q.label]} onChoose={(choice) => onChoose(q.label, choice)} />
          ))}
        </div>
      )}
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
      {unchosen && <p class="muted">{t("import.chooseAll")}</p>}
      <div class="actions">
        <button type="button" disabled={unchosen} onClick={onConfirm}>
          {preview.newTopicPaths.length ? t("import.confirmWithTopics") : t("import.confirm")}
        </button>
        <button type="button" class="secondary" onClick={onCancel}>
          {t("player.cancel")}
        </button>
      </div>
    </Dialog>
  );
}

/** `offerSample`: while there are no Sets, the sample pack can be loaded into the usual preview. Nothing is imported without it. */
export function ImportForm({ onImported, offerSample }: { onImported: () => void; offerSample: boolean }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<PackError[]>([]);
  const [preview, setPreviewState] = useState<ImportPreview>();
  const [choices, setChoices] = useState<Record<string, SimilarChoice>>({});
  // A new preview starts with no choices made.
  const setPreview = (next: ImportPreview | undefined) => {
    setPreviewState(next);
    setChoices({});
  };
  const [imported, setImported] = useState<string>();
  const [hasTopics, setHasTopics] = useState(false);
  const [appendTopics, setAppendTopics] = useState(true);
  useEffect(() => {
    topicPaths(storage).then((paths) => setHasTopics(paths.length > 0));
  }, [imported]);
  // A ref, not state: two clicks can land before a re-render and would import twice.
  const committing = useRef(false);

  const check = async (packText: string) => {
    setImported(undefined);
    setPreview(undefined);
    const parsed = parseQuestionPack(packText);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors([]);
    setPreview(await previewImport(parsed.pack, storage));
  };
  const loadSample = () => {
    setText(samplePack);
    void check(samplePack);
  };

  const confirm = async () => {
    if (!preview || committing.current) return;
    committing.current = true;
    try {
      // The preview listed these paths, so confirming it confirms them.
      await commitImport(preview, storage, { confirmedTopicPaths: preview.newTopicPaths, similarChoices: choices });
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
    <form
      class="card"
      onSubmit={(e) => {
        e.preventDefault();
        void check(text);
      }}
    >
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
      <div class="actions">
        <CopyButton label="import.copySkill" text={async () => questionWritingSkillText(appendTopics ? await topicPaths(storage) : undefined)} secondary />
        {hasTopics && (
          <label>
            <input type="checkbox" checked={appendTopics} onChange={(e) => setAppendTopics(e.currentTarget.checked)} /> {t("import.appendTopics")}
          </label>
        )}
        {offerSample && (
          <button type="button" class="secondary" disabled={preview !== undefined} onClick={loadSample}>
            {t("import.sample")}
          </button>
        )}
      </div>
      {imported && <p class="ok">{t("import.success", { title: imported })}</p>}
      {errors.length > 0 && <Errors errors={errors} />}
      {preview && (
        <Preview
          preview={preview}
          choices={choices}
          onChoose={(label, choice) => setChoices((current) => ({ ...current, [label]: choice }))}
          onConfirm={confirm}
          onCancel={() => setPreview(undefined)}
        />
      )}
    </form>
  );
}
