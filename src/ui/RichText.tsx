import { renderBlock, renderInline } from "../render/render";
import { blocksToText } from "../domain/display";
import type { ContentBlock } from "../domain/types";

/** Question content as Markdown with maths. The HTML comes from `render/render`, which sanitises it; this is the only place it reaches the page. `lang` is the language the text is written in. */
export function RichText({ source, inline, lang }: { source: string; inline?: boolean; lang?: string }) {
  return inline ? (
    <span class="rich" lang={lang} dangerouslySetInnerHTML={{ __html: renderInline(source) }} />
  ) : (
    <div class="rich" lang={lang} dangerouslySetInnerHTML={{ __html: renderBlock(source) }} />
  );
}

/**
 * The content blocks of a Question (stem, Option, Hint, Explanation, Rationale), each run of blocks marked with the language it is written in:
 * a block's own `language`, else the Question language, so a screen reader switches voice whatever the Interface language.
 */
export function QuestionText({ blocks, optionOrder, language, inline }: { blocks: ContentBlock[]; optionOrder: string[]; language: string; inline?: boolean }) {
  const runs: { language: string; blocks: ContentBlock[] }[] = [];
  for (const block of blocks) {
    const own = block.language ?? language;
    const last = runs[runs.length - 1];
    if (last?.language === own) last.blocks.push(block);
    else runs.push({ language: own, blocks: [block] });
  }
  return (
    <>
      {runs.map((run, i) => (
        <RichText key={i} source={blocksToText(run.blocks, optionOrder)} lang={run.language} inline={inline} />
      ))}
    </>
  );
}
