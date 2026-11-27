// Brand 0.1.1 exports explicit light/dark tokens. Reuse its entire light block for the browser's system preference,
// including the shadcn aliases, instead of keeping another palette. Vite 8.3.8 runs pre transforms before CSS imports.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

export function systemTheme(): Plugin {
  // Resolve the exported package file without Vite's virtual import.meta.resolve module, which Bun's test runner
  // cannot load (Vite 8.3.8 dist/node/module-runner.js, customizationHookNamespace).
  const tokens = readFileSync(createRequire(import.meta.url).resolve("@unset-sh/brand/tokens.css"), "utf8");
  const light = tokens.match(/:root\[data-theme="light"\]\s*\{([^{}]+)\}/)?.[1];
  if (!light) throw new Error("The pinned brand package has no light token block");
  const css = `@media (prefers-color-scheme: light) { :root:not([data-theme]) {${light}} }`;

  return {
    name: "brand-system-theme",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0]?.endsWith("/src/app.css") && code.includes("/* @brand-system-theme */")) {
        return { code: code.replace("/* @brand-system-theme */", css), map: null };
      }
      return null;
    },
  };
}
