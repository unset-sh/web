import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const folder = new URL("../static/sharing/", import.meta.url);
const source = JSON.parse(readFileSync(new URL("source.json", folder), "utf8")) as { commit: string; sha256: string };

test("default_sharing_card_matches_the_pinned_brand_artifact", () => {
  expect(source.commit).toMatch(/^[a-f0-9]{40}$/);
  const bytes = readFileSync(new URL("unset.png", folder));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});
