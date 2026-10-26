# PencilMark

A revision tool that records how each question was answered (hesitation, answer changes, eliminations, hints, confidence, marks), so that AI grading can focus its explanation on where the reasoning actually wavered, not just on what was wrong.

PencilMark runs entirely in the browser and keeps its data on your device (IndexedDB). It is served from GitHub Pages at <https://hmaevan.github.io/pencilmark/>.

> Work in progress. The interface is in Chinese for now; English follows.

## How it works

1. Ask any AI to write a **Question pack** (JSON) and paste it into the import box.
2. The pack becomes a **Set** on the home screen. Start it to sit a **Session**.
3. Submit, review your answers, and copy the **Digest** into an AI chat for grading.

Domain terms are defined in [`GLOSSARY.md`](GLOSSARY.md); design decisions are in [`docs/adr/`](docs/adr/).

## Development

Requires Node.js 24.

```bash
npm install
npm run dev        # http://localhost:5173/pencilmark/
npm test           # Vitest
npm run typecheck
npm run build      # single self-contained dist/index.html
```

## Licence

[MIT](LICENSE)
