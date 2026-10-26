import type { ContentBlock } from "../domain/types";
import type { PackError, PackQuestion } from "./importer";
import { joinBlocks, OPTION_PLACEHOLDER } from "./normalise";

/** Same shape as a PackError: located, English, written for the AI. A warning does not stop the import. */
export type PackWarning = PackError;

// "以上都对", "以上皆非", "以上均不是", "以上全部"…, but not "50以上".
const REFERS_TO_OTHERS = /\b(all|none) of the above\b|以上(?:都|皆|均|全|各)/i;

// "(B)", "option A", "choice C", "answer D", "选项B", "B选项", "B项" (not "B项目"). Placeholders are removed first.
const BARE_LETTER = /\([A-H]\)|\b(?:[Oo]ption|[Cc]hoice|[Aa]nswer)s?\s+[A-H]\b|选项\s*[A-H](?![A-Za-z])|(?<![A-Za-z])[A-H]\s*选?项(?!目)/;

export function packWarnings(q: PackQuestion): PackWarning[] {
  const warnings: PackWarning[] = [];
  const warn = (field: string, message: string) => warnings.push({ question: q.label, field, message });

  const fields: [string, ContentBlock[] | undefined][] = [
    ["stem", q.stem],
    ...q.options.flatMap((o, i): [string, ContentBlock[] | undefined][] => [
      [`options[${i}].content`, o.content],
      [`options[${i}].rationale`, o.rationale],
      [`options[${i}].misconception`, o.misconception],
    ]),
    ["explanation", q.explanation],
  ];
  for (const [field, blocks] of fields) {
    if (BARE_LETTER.test(joinBlocks(blocks).replace(OPTION_PLACEHOLDER, ""))) {
      warn(field, "refers to an Option by a letter, which changes when Options are shuffled; write {{opt:<optionId>}} instead");
    }
  }

  if (q.optionOrder !== "fixed") {
    q.options.forEach((o, i) => {
      if (!o.pin && REFERS_TO_OTHERS.test(joinBlocks(o.content))) {
        warn(`options[${i}].content`, "refers to the other Options but is not pinned, so shuffling can move it; add \"pin\": \"last\"");
      }
    });
  }
  return warnings;
}
