import { t, type TranslationKey } from "../i18n/i18n";

/** Saves `text()` as a file of that name; the main button, with a CopyButton link beside it, for attaching the text to an AI chat. */
export function DownloadButton({ label, fileName, text, secondary }: { label: TranslationKey; fileName: () => string; text: () => string | Promise<string>; secondary?: boolean }) {
  const download = async () => {
    const url = URL.createObjectURL(new Blob([await text()], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
  };
  return (
    <button type="button" class={secondary ? "secondary" : undefined} onClick={download}>
      {t(label)}
    </button>
  );
}
