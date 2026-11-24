// The copied shadcn-svelte components and utils.ts stay what brand's gallery pins (source.json): each file, with the
// import rewrite the shadcn-svelte CLI makes for components.json's aliases undone, has the sha256 recorded from brand's
// tag, and no file sits in this folder unrecorded. A component is changed by copying a newer pinned version, not by
// editing it here; brand styles it through CSS.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..", "..", "..", "..");
const source = JSON.parse(readFileSync(join(import.meta.dirname, "source.json"), "utf8")) as {
  rewrites: Record<string, string>;
  files: { path: string; sha256: string }[];
};
const components = JSON.parse(readFileSync(join(WEB, "components.json"), "utf8")) as {
  aliases: Record<string, string>;
};

/** The file as brand's gallery has it: every rewrite undone. */
function upstream(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(source.rewrites)) out = out.replaceAll(to, from);
  return out;
}

describe("copied components", () => {
  test("each_file_matches_the_pinned_upstream_bytes", () => {
    for (const file of source.files) {
      const text = readFileSync(join(WEB, file.path), "utf8");
      expect(createHash("sha256").update(upstream(text)).digest("hex"), file.path).toBe(file.sha256);
    }
  });

  test("no_file_in_the_folder_is_unrecorded", () => {
    const here = readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" })
      .map((file) => relative(WEB, join(import.meta.dirname, file)))
      .filter((path) => /\.(svelte|ts|md)$/.test(path) && !path.endsWith("source.test.ts"));
    const recorded = new Set(source.files.map((file) => file.path));
    for (const path of here) expect(recorded.has(path), path).toBe(true);
  });

  test("the_rewrites_are_what_components_json_tells_the_cli", () => {
    expect(source.rewrites).toEqual({
      "$lib/registry/ui/": `${components.aliases.ui}/`,
      "$lib/utils.js": `${components.aliases.utils}.js`,
    });
  });
});
