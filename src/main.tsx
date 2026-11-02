import { render } from "preact";
import { App } from "./ui/App";
import "./ui/styles.css";
import { storage, storageMode } from "./ui/appStorage";
import { writeSchemaDocument } from "./domain/schemaDocument";
import { DEFAULT_PREFERENCES, loadPreferences } from "./domain/settings";
import { applyLanguage } from "./i18n/i18n";

// Ask the browser not to evict the IndexedDB data under storage pressure.
void storageMode.then((mode) => mode !== "artifact" && navigator.storage?.persist?.());
// Keeps meta/schema current for an AI reading the database; it imports nothing.
void writeSchemaDocument(storage);

// The stored Interface language is read before anything is drawn, so the page is never shown (or spoken) in the browser's language first.
const language = await loadPreferences(storage).then(
  (preferences) => preferences.display.language,
  () => DEFAULT_PREFERENCES.display.language,
);
applyLanguage(language);
render(<App initialLanguage={language} />, document.getElementById("app")!);
