import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/** KaTeX's CSS lists each font as woff2, woff and ttf; every browser PencilMark supports reads woff2, so the other two would only triple the inlined fonts. */
const katexWoff2Only = {
  name: "pencilmark-katex-woff2-only",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith("katex.min.css")) return;
    return code.replace(/,url\([^)]*\.woff\) format\("woff"\),url\([^)]*\.ttf\) format\("truetype"\)/g, "");
  },
};

export default defineConfig({
  base: "/pencilmark/",
  plugins: [katexWoff2Only, preact(), viteSingleFile()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
