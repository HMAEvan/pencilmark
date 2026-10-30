import type MarkdownIt from "markdown-it";
import katex from "katex";

/** A formula in Question text: where it ends, its LaTeX, and whether it is set on a line of its own. */
export type MathMatch = { end: number; tex: string; display: boolean };

const isSpace = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\r";
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** The first `close` at or after `from`, skipping backslash-escaped characters, accepted by `ok`. */
function findClose(src: string, from: number, close: string, ok: (at: number) => boolean): number {
  for (let i = from; i < src.length; i++) {
    if (src.startsWith(close, i) && ok(i)) return i;
    if (src[i] === "\\") i++;
  }
  return -1;
}

/**
 * The formula starting at `pos`, if one does. Delimiters: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`.
 * `$` follows Pandoc's rule: an opening `$` is not followed by a space; a closing `$` is not preceded by a space nor followed by a digit.
 * So "costs $5 and $10" stays text.
 */
export function matchMathAt(src: string, pos: number): MathMatch | null {
  const done = (open: number, close: string, closeAt: number, display: boolean): MathMatch | null =>
    closeAt < 0 ? null : { end: closeAt + close.length, tex: src.slice(open, closeAt), display };
  if (src.startsWith("$$", pos)) {
    const display = done(pos + 2, "$$", findClose(src, pos + 2, "$$", () => true), true);
    if (display && display.tex.trim()) return display;
  }
  if (src[pos] === "$") {
    const start = pos + 1;
    if (start >= src.length || isSpace(src[start]) || src[start] === "$") return null;
    return done(start, "$", findClose(src, start, "$", (i) => i > start && !isSpace(src[i - 1]) && !isDigit(src[i + 1])), false);
  }
  if (src.startsWith("\\(", pos)) return done(pos + 2, "\\)", findClose(src, pos + 2, "\\)", () => true), false);
  if (src.startsWith("\\[", pos)) return done(pos + 2, "\\]", findClose(src, pos + 2, "\\]", () => true), true);
  return null;
}

/** The start and end of every formula in `text`, in order. */
export function mathSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (let i = 0; i < text.length; ) {
    const match = text[i] === "$" || text[i] === "\\" ? matchMathAt(text, i) : null;
    if (match) {
      spans.push({ start: i, end: match.end });
      i = match.end;
    } else i += text[i] === "\\" ? 2 : 1;
  }
  return spans;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Typesets a formula; one that fails to parse comes back as its source text in an error style, so the rest of the Question still renders. */
function typeset(tex: string, display: boolean, source: string): string {
  try {
    // HTML output only: the sanitiser drops MathML's `annotation`, which would leave the LaTeX source as stray text. The source is the accessible name instead.
    const html = katex.renderToString(tex, { displayMode: display, throwOnError: true, trust: false, strict: "ignore", output: "html", maxSize: 30, maxExpand: 200 });
    return `<span role="math" aria-label="${escapeHtml(tex)}">${html}</span>`;
  } catch {
    return `<span class="math-error" title="LaTeX">${escapeHtml(source)}</span>`;
  }
}

/** markdown-it plugin: formulas become `math` tokens, found before emphasis, escapes and the rest see their characters. */
export function mathPlugin(md: InstanceType<typeof MarkdownIt>): void {
  md.inline.ruler.before("escape", "math", (state, silent) => {
    const c = state.src[state.pos];
    if (c !== "$" && c !== "\\") return false;
    const match = matchMathAt(state.src, state.pos);
    if (!match || match.end > state.posMax) return false;
    if (!silent) {
      const token = state.push("math", "", 0);
      token.content = match.tex;
      token.meta = { display: match.display, source: state.src.slice(state.pos, match.end) };
    }
    state.pos = match.end;
    return true;
  });
  md.renderer.rules["math"] = (tokens, i) => typeset(tokens[i]!.content, (tokens[i]!.meta as { display: boolean; source: string }).display, (tokens[i]!.meta as { source: string }).source);
}
