import { useEffect, useState } from "preact/hooks";

/** The window shape that turns the top bar into the side column; keep in step with the media query in styles.css. */
export const SIDE_COLUMN_QUERY = "(min-width: 600px) and (min-aspect-ratio: 1001/1000)";

/**
 * The top bar's dropped-down navigation. Ignored in the side column, where the navigation is always shown.
 * It closes on Escape, on a press outside `.answer-panel`, and when the layout switches.
 */
export function useNavDropdown() {
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!navOpen) return;
    const close = () => setNavOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointer = (e: PointerEvent) => !(e.target as Element).closest(".answer-panel") && close();
    const layout = matchMedia(SIDE_COLUMN_QUERY);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    layout.addEventListener("change", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      layout.removeEventListener("change", close);
    };
  }, [navOpen]);
  return [navOpen, setNavOpen] as const;
}
