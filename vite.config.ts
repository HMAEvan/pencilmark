import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "/pencilmark/",
  plugins: [preact(), viteSingleFile()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
