import { useEffect, useState } from "preact/hooks";
import { Home } from "./Home";
import { Player } from "./Player";
import { Review } from "./Review";
import { ShowcaseReview } from "./ShowcaseReview";
import { storage, storageMode, type StorageMode } from "./appStorage";
import { applyLanguage, t } from "../i18n/i18n";
import { DEFAULT_PREFERENCES, LANGUAGES, loadPreferences, saveDisplayPreferences, type LanguagePreference } from "../domain/settings";

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

  // The browser's language shows until the stored preference loads. Changing it re-renders every screen.
  const [language, setLanguage] = useState<LanguagePreference>(DEFAULT_PREFERENCES.display.language);
  useEffect(() => void loadPreferences(storage).then((preferences) => setLanguage(preferences.display.language)), []);
  applyLanguage(language);
  const chooseLanguage = (preference: LanguagePreference) => {
    setLanguage(preference);
    void saveDisplayPreferences(storage, { language: preference });
  };

  const [page, id] = route;
  return (
    <>
      {mode === "artifactUnavailable" && <p class="card bad storage-warning">{t("storage.artifactUnavailable")}</p>}
      {page === "session" && id ? <Player key={id} sessionId={id} /> : page === "review" && id ? <Review key={id} sessionId={id} /> : page === "showcase" && id ? <ShowcaseReview key={id} name={id} /> : <Home />}
      <footer class="muted app-footer">
        {mode && <p>{t(mode === "artifact" ? "storage.artifact" : "storage.local")}</p>}
        <label>
          {t("language.label")}{" "}
          <select value={language} onChange={(e) => chooseLanguage(e.currentTarget.value as LanguagePreference)}>
            <option value="browser">{t("language.browser")}</option>
            {LANGUAGES.map((option) => (
              <option key={option} value={option}>
                {t(`language.${option}`)}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </>
  );
}
