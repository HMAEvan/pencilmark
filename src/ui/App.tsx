import { useEffect, useState } from "preact/hooks";
import { Home } from "./Home";
import { Player } from "./Player";
import { Review } from "./Review";

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

  const [page, id] = route;
  if (page === "session" && id) return <Player key={id} sessionId={id} />;
  if (page === "review" && id) return <Review key={id} sessionId={id} />;
  return <Home />;
}
