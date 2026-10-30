import DOMPurify from "dompurify";

/**
 * THE sanitiser: every string of generated HTML (Markdown output and KaTeX output) passes through here before it reaches the page,
 * and nothing else in the code base assigns HTML to the DOM except `RichText`, which takes it from `renderRich`, which calls this last.
 *
 * Markdown is parsed with raw HTML disabled and images off, and KaTeX runs with `trust: false`, so this is the second layer.
 * What is allowed: the HTML, SVG and MathML elements and attributes DOMPurify itself allows (KaTeX needs inline `style`, SVG paths and MathML).
 * What is removed: scripts, event handlers, `javascript:` and other unsafe URLs, forms, iframes and objects. Links get `rel` and `target` so they cannot reach back to the opener.
 */
const purify = DOMPurify(window);

purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }
});

export function sanitiseHtml(html: string): string {
  return purify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: false, mathMl: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "img", "video", "audio", "source", "link", "meta", "base"],
    FORBID_ATTR: ["srcset", "formaction"],
    ALLOW_DATA_ATTR: false,
  });
}
