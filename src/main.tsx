import { render } from "preact";
import { App } from "./ui/App";
import "./ui/styles.css";
import { storage, storageMode } from "./ui/appStorage";
import { writeSchemaDocument } from "./domain/schemaDocument";

// Ask the browser not to evict the IndexedDB data under storage pressure.
void storageMode.then((mode) => mode !== "artifact" && navigator.storage?.persist?.());
// Keeps meta/schema current for an AI reading the database; it imports nothing.
void writeSchemaDocument(storage);

render(<App />, document.getElementById("app")!);
