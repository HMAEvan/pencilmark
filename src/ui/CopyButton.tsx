import { useState } from "preact/hooks";
import { t, type TranslationKey } from "../i18n/i18n";

/** Copies `text()` to the clipboard; where the browser refuses, shows it selected for copying by hand. */
export function CopyButton({ label, text, secondary }: { label: TranslationKey; text: () => string | Promise<string>; secondary?: boolean }) {
  const [state, setState] = useState<{ key: TranslationKey; text?: string }>();
  const copy = async () => {
    const value = await text();
    try {
      await navigator.clipboard.writeText(value);
      setState({ key: "common.copied" });
    } catch {
      setState({ key: "common.copyFailed", text: value });
    }
  };
  return (
    <>
      <button type="button" class={secondary ? "secondary" : undefined} onClick={copy}>
        {t(label)}
      </button>
      {state && <span class="muted">{t(state.key)}</span>}
      {state?.text !== undefined && <textarea readOnly rows={10} value={state.text} ref={(el) => el?.select()} />}
    </>
  );
}
