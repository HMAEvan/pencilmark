import { renderBlock, renderInline } from "../render/render";

/** Question content as Markdown with maths. The HTML comes from `render/render`, which sanitises it; this is the only place it reaches the page. */
export function RichText({ source, inline }: { source: string; inline?: boolean }) {
  return inline ? (
    <span class="rich" dangerouslySetInnerHTML={{ __html: renderInline(source) }} />
  ) : (
    <div class="rich" dangerouslySetInnerHTML={{ __html: renderBlock(source) }} />
  );
}
