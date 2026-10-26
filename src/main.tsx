import { render } from "preact";
import { App } from "./ui/App";
import "./ui/styles.css";

// Ask the browser not to evict the IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

render(<App />, document.getElementById("app")!);
