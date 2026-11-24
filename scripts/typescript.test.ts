// Two TypeScripts, on purpose. SvelteKit 3.2.0 and svelte-check 4.7.8 import `typescript` for its JavaScript
// compiler API, which TypeScript 7 no longer ships (its package exports only lib/version.cjs), so `typescript` stays
// on 6. The checking runs on TypeScript 7, installed as `@typescript/native` (svelte-check --tsgo). Kit 3.4.0 still
// peers typescript ^6 and names this same split in its typescript_compiler_api_missing error. A bump that moves
// `typescript` to 7 breaks the build, so it fails here first, with the reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  devDependencies: Record<string, string>;
};
const installed = (name: string) =>
  (JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;

describe("TypeScript", () => {
  test("`typescript` is 6, the compiler API SvelteKit and svelte-check load", () => {
    expect(manifest.devDependencies.typescript).toMatch(/^6\.\d+\.\d+$/);
    expect(installed("typescript")).toBe(manifest.devDependencies.typescript);
  });

  test("`@typescript/native` is 7, the checker", () => {
    expect(manifest.devDependencies["@typescript/native"]).toMatch(/^npm:typescript@7\.\d+\.\d+$/);
    expect(installed("@typescript/native")).toMatch(/^7\./);
  });
});
