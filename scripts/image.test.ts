// The image's Dockerfile and build context, checked without building, as backend's scripts/image.test.ts checks its
// own: every base is pinned by digest at the Bun version web runs on, the runtime runs as a non-root user, the package
// token reaches only the install as a BuildKit secret, and the build context holds only what the Dockerfile copies,
// so no source server.ts imports at run time is left out.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
const instructions = dockerfile
  .replace(/\\\n/g, " ")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));
const bunVersion = readFileSync(join(ROOT, ".bun-version"), "utf8").trim();

describe("the Dockerfile", () => {
  const froms = instructions.filter((line) => /^FROM\s/i.test(line));

  test("pins every base to the official Bun image of .bun-version, by digest", () => {
    expect(froms.length).toBeGreaterThan(0);
    for (const from of froms) {
      expect(from).toMatch(
        new RegExp(`^FROM oven/bun:${bunVersion.replaceAll(".", "\\.")}-[a-z]+@sha256:[0-9a-f]{64} AS [a-z]+$`),
      );
    }
  });

  test("runs the last stage as a numeric non-root user", () => {
    const lastStage = instructions.slice(instructions.lastIndexOf(froms.at(-1) as string));
    const users = lastStage.filter((line) => /^USER\s/i.test(line));
    expect(users).toHaveLength(1);
    const [uid, gid] = (users[0] as string).replace(/^USER\s+/i, "").split(":");
    expect(Number(uid)).toBeGreaterThan(0);
    expect(Number(gid)).toBeGreaterThan(0);
  });

  test("takes no build argument, sets no secret, and mounts the package token only for the install", () => {
    expect(instructions.filter((line) => /^ARG\s/i.test(line))).toEqual([]);
    for (const line of instructions.filter((l) => /^ENV\s/i.test(l))) {
      expect(line).not.toMatch(/SECRET|PASSWORD|TOKEN|KEY/i);
    }
    const mounts = instructions.filter((line) => line.includes("--mount")).map((line) => line.replace(/\s+/g, " "));
    expect(mounts).toEqual([
      "RUN --mount=type=secret,id=github_packages_token,env=GITHUB_PACKAGES_TOKEN,required=true bun install --frozen-lockfile --ignore-scripts",
    ]);
  });
});

describe("the build context", () => {
  const ignore = readFileSync(join(ROOT, ".dockerignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const excluded = ignore.filter((line) => !line.startsWith("!") && line !== "*").map((line) => new Bun.Glob(line));
  const allowed = ignore.filter((line) => line.startsWith("!")).map((line) => line.slice(1));
  const included = (path: string) =>
    allowed.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry)) &&
    !excluded.some((glob) => glob.match(path));

  test("starts from nothing, so a secret, a local file or a local build never reaches it", () => {
    expect(ignore[0]).toBe("*");
    for (const path of [".env", "secrets/x", "build/handler.js", "node_modules/x/package.json"]) {
      expect(included(path)).toBe(false);
    }
  });

  test("leaves out the tests", () => {
    for (const file of ["src/gate.test.ts", "src/lib/server/config.test.ts"]) expect(included(file)).toBe(false);
  });

  test("holds every file server.ts imports, and the runtime stage copies each", () => {
    const runtime = instructions.slice(
      instructions.lastIndexOf(instructions.filter((l) => /^FROM\s/i.test(l)).at(-1) as string),
    );
    const copied = runtime
      .filter((line) => /^COPY\s/i.test(line) && !line.includes("--from"))
      .flatMap((line) =>
        line
          .replace(/^COPY\s+/i, "")
          .split(/\s+/)
          .slice(0, -1),
      )
      .map((path) => path.replace(/^\/app\//, ""));
    const inImage = (path: string) => copied.some((entry) => path === entry || path.startsWith(`${entry}/`));
    const missing: string[] = [];
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      if (!included(file) || !inImage(file)) missing.push(file);
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        visit(relative(ROOT, join(ROOT, dirname(file), String(match[1]))));
      }
    };
    visit("server.ts");
    expect(seen.size).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});

test("every source folder the runtime copies exists", () => {
  for (const folder of ["src/lib/errors", "src/lib/server", "src/routes"])
    expect(readdirSync(join(ROOT, folder)).length).toBeGreaterThan(0);
});
