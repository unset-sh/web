// The copy of backend's internal API type (org-0017) stays what source.json pins, and holds for the Elysia web
// installs: the type is generated against one exact Elysia version, and another would let Eden widen it unnoticed.
// To take a newer contract, copy app.d.ts from backend's main at a full commit and record its commit and hash here.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..", "..", "..", "..");
const source = JSON.parse(readFileSync(join(import.meta.dirname, "source.json"), "utf8")) as {
  source: string;
  commit: string;
  from: string;
  path: string;
  sha256: string;
};
const copy = readFileSync(join(WEB, source.path), "utf8");
const version = (file: string) => (JSON.parse(readFileSync(join(WEB, file), "utf8")) as { version: string }).version;
const manifest = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")) as {
  devDependencies: Record<string, string>;
};

describe("backend's internal API type", () => {
  test("the_copy_matches_the_pinned_commit's_bytes", () => {
    expect(source.source).toBe("unset-sh/backend");
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(createHash("sha256").update(copy).digest("hex")).toBe(source.sha256);
  });

  test("web_installs_exactly_the_elysia_the_type_was_generated_for", () => {
    const generatedFor = /It holds for elysia (\d+\.\d+\.\d+) exactly\./.exec(copy)?.[1];
    expect(generatedFor).toBeDefined();
    expect(manifest.devDependencies.elysia).toBe(generatedFor);
    expect(version("node_modules/elysia/package.json")).toBe(generatedFor);
  });
});
