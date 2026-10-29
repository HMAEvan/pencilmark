import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";

/**
 * Every in-page confirmation, centred on screen over the page.
 * In the page, not confirm(): some embedded browsers suppress native dialogs.
 * Focus moves into the dialog when it opens; Escape cancels when `onCancel` is given. `wide` suits a long preview.
 */
export function Dialog({ label, onCancel, wide, children }: { label: string; onCancel?: () => void; wide?: boolean; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  // Before paint, so a key pressed straight after opening already lands in the dialog.
  useLayoutEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && cancel.current?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <div class="dialog-backdrop">
      <div ref={ref} class={`card dialog${wide ? " wide" : ""}`} role="alertdialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
