import MarkdownIt from "markdown-it";
import "katex/dist/katex.min.css";
import { mathPlugin } from "./maths";
import { sanitiseHtml } from "./sanitise";

/**
 * Question content is Markdown with LaTeX maths. Raw HTML in the source is not HTML: markdown-it escapes it, so it is shown as text.
 * Images are off (a remote image would be a tracking request), and `~` is strikethrough only as `~~double tildes~~`, so `5~10` stays intact.
 */
const md = new MarkdownIt({ html: false, linkify: false, breaks: true }).disable("image").use(mathPlugin);

const cache = new Map<string, string>();

function remember(key: string, make: () => string): string {
  let html = cache.get(key);
  if (html === undefined) {
    html = sanitiseHtml(make());
    if (cache.size > 500) cache.clear();
    cache.set(key, html);
  }
  return html;
}

/** Sanitised HTML for Question text that stands on its own: paragraphs, lists, code blocks. */
export const renderBlock = (source: string): string => remember(`b${source}`, () => md.render(source));

/** Sanitised HTML for text that sits inside a line or a button (an Option, a Hint label, a word-difference run): no block elements. */
export const renderInline = (source: string): string => remember(`i${source}`, () => md.renderInline(source));
