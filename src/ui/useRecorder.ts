import { useEffect, useRef } from "preact/hooks";
import type { Recorder } from "../recorder/recorder";

const SAVE_INTERVAL_MS = 3000;

/** A screen's Recorder, and what the screen records first, after the resume event. */
export type ScreenRecording = { recorder: Recorder; afterShow?: () => void };

/**
 * Records the page being hidden and shown into the Raw log, and saves the buffer every few seconds, while the screen is open.
 * `open` loads the screen and returns its Recorder, or nothing when there is nothing to record.
 * Setting the returned ref to `undefined` stops recording, as submission does.
 */
export function useRecorder(open: () => Promise<ScreenRecording | undefined>, sessionId: string) {
  const recorderRef = useRef<Recorder | undefined>(undefined);

  useEffect(() => {
    const report = (e: unknown) => console.error("Writing the Raw log failed", e);
    // A hidden page may be killed, so the chunk is sealed; showing it again starts a new chunk.
    // `pagehide` and `visibilitychange` often fire together; record each change of state once.
    // A page opened in a background tab starts hidden and records its resume event when shown.
    let hidden = document.visibilityState === "hidden";
    let left = false;
    void open().then((opened) => {
      if (!opened || left) return;
      recorderRef.current = opened.recorder;
      if (!hidden) opened.recorder.show();
      opened.afterShow?.();
    });
    const hide = () => {
      if (hidden) return;
      hidden = true;
      // A Note being typed is saved on blur; blurring it first records it before the chunk is sealed.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      void recorderRef.current?.hide().catch(report);
    };
    const show = () => {
      if (!hidden) return;
      hidden = false;
      recorderRef.current?.show();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? hide() : show());
    // A page restored from the back-forward cache gets `pageshow` without a visibility change.
    const onPageShow = (e: PageTransitionEvent) => e.persisted && show();
    const saveTimer = setInterval(() => void recorderRef.current?.save().catch(report), SAVE_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", hide);
    addEventListener("pageshow", onPageShow);
    return () => {
      left = true;
      clearInterval(saveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", hide);
      removeEventListener("pageshow", onPageShow);
      // Leaving the screen for another takes the Session out of view, as hiding the page does.
      hide();
    };
  }, [sessionId]);

  return recorderRef;
}
