import { useEffect, useState } from "preact/hooks";
import { Home } from "./Home";
import { Player } from "./Player";
import { Review } from "./Review";
import { storageMode, type StorageMode } from "./appStorage";
import { t } from "../i18n/i18n";

// Hash routes keep the single-file build working under /pencilmark/ on GitHub Pages.
function currentRoute(): string[] {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

export function navigate(...parts: string[]) {
  location.hash = `#/${parts.join("/")}`;
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);

  const [mode, setMode] = useState<StorageMode>();
  useEffect(() => void storageMode.then(setMode), []);

  const [page, id] = route;
  return (
    <>
      {mode === "artifactUnavailable" && <p class="card bad storage-warning">{t("storage.artifactUnavailable")}</p>}
      {page === "session" && id ? <Player key={id} sessionId={id} /> : page === "review" && id ? <Review key={id} sessionId={id} /> : <Home />}
      {mode && <footer class="muted storage-mode">{t(mode === "artifact" ? "storage.artifact" : "storage.local")}</footer>}
    </>
  );
}
