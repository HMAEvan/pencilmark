# PencilMark

A revision tool that records how each question was answered (hesitation, answer changes, eliminations, hints, confidence, marks), so that AI grading can focus its explanation on where the reasoning actually wavered, not just on what was wrong.

PencilMark runs entirely in the browser and keeps its data on your device (IndexedDB). It is served from GitHub Pages at <https://hmaevan.github.io/pencilmark/>.

> Work in progress. The interface is in Chinese for now; English follows.

## How it works

1. Press **Copy question-writing prompt**, paste it into any AI chat with your study material, and paste the AI's reply (a **Question pack**, JSON) into the import box.
2. The pack becomes a **Set** on the home screen. Start it to sit a **Session**.
3. Submit, review your answers, and press **Copy grading materials** to paste the grading instructions and the **Digest** into an AI chat. In a chat that already has the instructions, **Copy Digest only**.

To try it without any material, press **Import sample Set** on an empty home screen.

The two prompts are self-contained skills that work in any AI chat, and in Claude as skills:

- [`skills/question-writing/SKILL.md`](skills/question-writing/SKILL.md): the Question pack format, with a complete example.
- [`skills/grading/SKILL.md`](skills/grading/SKILL.md): how to read a Digest and teach from it.

Sample Question packs (fabricated general-science Questions) are in [`samples/`](samples/). The file formats and the database are documented in [`schema/`](schema/README.md). Domain terms are defined in [`GLOSSARY.md`](GLOSSARY.md); design decisions are in [`docs/adr/`](docs/adr/).

## Security design

PencilMark treats everything an AI writes, and every file it imports, as untrusted input.

- **AI-generated text is never trusted as HTML.** Question text is shown as plain text: the interface escapes it, and no code path inserts raw HTML. When Markdown and maths rendering arrive, the generated HTML is sanitised before it reaches the page.
- **Imports are validated before anything is written.** A Question pack is parsed as JSON and validated against [its JSON Schema](schema/question-pack.schema.json), which rejects unknown fields, and then against the rules a schema cannot express (answers naming real Options, unique labels, the true/false convention). Errors are located by Question and field. A valid pack is shown as a preview first, and new Tracks and Topics are created only once you confirm them. The pack's own labels are never used as IDs: the tool assigns its own. Nothing is imported automatically, the sample Set included.
- **The Raw log cannot be quietly rewritten.** Sealed chunks are never written again, and each carries a hash of itself and of the chunk before it, so corruption or tampering is reported when the Session is opened. This detects accidents and casual edits; it is not a signature.
- **Your data and keys stay on your device.** There is no PencilMark server ([ADR-0006](docs/adr/0006-no-self-hosted-server.md)); data lives in your browser's IndexedDB. The current version uses no API keys: you copy text to and from AI chats yourself. When an API mode arrives, a key you enter will be stored only on your device and sent only to the AI provider it belongs to.

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
