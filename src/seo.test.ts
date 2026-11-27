// Search behavior on the production entry point, following gate.test.ts: Bun serves adapter-node's build, with no
// backend listening and no browser script required to read page content or metadata. `bun run check` builds first.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..");
const HOST = "unset.test";
const ORIGIN = `https://${HOST}`;
const IMAGE = `${ORIGIN}/sharing/unset.png`;
const processes: ChildProcess[] = [];
let address = 0;

type Options = { method?: string; host?: string | null; headers?: Record<string, string> };
type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };
type Site = { call: (path: string, options?: Options) => Promise<Answer> };

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => done(port));
    });
  });
}

/** Keep Host under the test's control and preserve binary responses for the actual sharing image. */
function call(port: number, path: string, options: Options = {}): Promise<Answer> {
  const headers: Record<string, string> = {
    "x-forwarded-for": `198.51.100.${(address++ % 250) + 1}`,
    ...options.headers,
  };
  if (options.host !== null) headers.host = options.host ?? HOST;
  return new Promise((done, fail) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: options.method ?? "GET", headers, setHost: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.once("error", fail);
      },
    );
    req.once("error", fail);
    req.end();
  });
}

async function start(listing: "off" | "on"): Promise<Site> {
  const port = await freePort();
  const web = spawn("bun", ["server.ts"], {
    cwd: WEB,
    env: {
      PATH: process.env.PATH ?? "",
      UNSET_ENV: "test",
      UNSET_SERVICE: "web",
      UNSET_COMMIT: "c".repeat(40),
      LISTEN_PORT: String(port),
      PUBLIC_ORIGIN: ORIGIN,
      HTTP_ALLOWED_HOSTS: HOST,
      TRUSTED_PROXY_MODE: "header",
      TRUSTED_PROXY_HEADER: "x-forwarded-for",
      TRUSTED_PROXY_CIDRS: "127.0.0.1/32,::1/128",
      BACKEND_URL: "http://127.0.0.1:9",
      SEARCH_LISTING: listing,
    },
  });
  processes.push(web);
  let output = "";
  for (const stream of [web.stdout, web.stderr]) stream?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  for (let tries = 0; ; tries += 1) {
    const ready = await call(port, "/health").then(
      (answer) => answer.status === 200,
      () => false,
    );
    if (ready) return { call: (path, options) => call(port, path, options) };
    if (tries > 100 || web.exitCode !== null) throw new Error(`SEO server (${listing}) did not start:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Read the emitted head without depending on attribute order or a browser having hydrated it. */
function tags(html: string, name: "meta" | "link"): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])),
  );
}

function meta(html: string, name: string, key = "name"): string | undefined {
  const found = tags(html, "meta").filter((tag) => tag[key] === name);
  expect(found, `one ${name} tag`).toHaveLength(1);
  return found[0]?.content;
}

let sites: Record<"on" | "off", Site>;
beforeAll(async () => {
  if (!existsSync(join(WEB, "build", "handler.js"))) throw new Error("no build: run `bun run build` first");
  const [off, on] = await Promise.all([start("off"), start("on")]);
  sites = { off, on };
}, 30_000);

afterAll(() => {
  for (const web of processes) if (web.exitCode === null) web.kill("SIGKILL");
});

describe.each(["off", "on"] as const)("search listing %s", (listing) => {
  const get = (path: string, options?: Options) => sites[listing].call(path, options);

  test("home_content_and_metadata_are_present_in_the_initial_html", async () => {
    const answer = await get("/?utm_source=campaign&return=https%3A%2F%2Fevil.example", {
      host: `${HOST}:8080`,
      headers: { "x-forwarded-host": "evil.example" },
    });
    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toContain("text/html");
    const html = answer.body.toString();
    expect([...html.matchAll(/<main(?:\s|>)/g)]).toHaveLength(1);
    expect([...html.matchAll(/<h1(?:\s|>)/g)]).toHaveLength(1);
    expect(html).toContain("Your corner");
    expect(html).toContain("of the internet.");
    expect(html).toContain('href="/login"');
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
    expect(titles).toHaveLength(1);
    const title = titles[0]?.[1];
    expect(title).toBe("unset — Your profile, projects and links");
    const description = meta(html, "description");
    expect(description).toContain("AT Protocol");
    const canonical = tags(html, "link").filter((tag) => tag.rel === "canonical");
    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.href).toBe(`${ORIGIN}/`);
    const robots = listing === "on" ? "index, follow, max-image-preview:large" : "noindex";
    expect(meta(html, "robots")).toBe(robots);
    expect(answer.headers["x-robots-tag"]).toBe(robots);

    for (const [name, value] of Object.entries({
      "og:site_name": "unset",
      "og:type": "website",
      "og:title": title,
      "og:description": description,
      "og:url": `${ORIGIN}/`,
      "og:image": IMAGE,
      "og:image:width": "1200",
      "og:image:height": "630",
    }))
      expect(meta(html, name, "property")).toBe(value);
    for (const [name, value] of Object.entries({
      "twitter:card": "summary_large_image",
      "twitter:title": title,
      "twitter:description": description,
      "twitter:image": IMAGE,
    }))
      expect(meta(html, name)).toBe(value);
    expect(meta(html, "og:image:alt", "property")).toMatch(/unset/i);
    expect(meta(html, "twitter:image:alt")).toBe(meta(html, "og:image:alt", "property"));

    const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    expect(schemas).toHaveLength(1);
    expect(JSON.parse(schemas[0]?.[1] ?? "")).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      name: "unset",
      url: `${ORIGIN}/`,
      description,
    });
  });

  test("robots_and_sitemap_only_advertise_real_public_pages_when_enabled", async () => {
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.headers["content-type"]).toContain("text/plain");
    expect(robots.body.toString()).toBe(
      listing === "on" ? `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n",
    );
    const sitemap = await get("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers["content-type"]).toContain("application/xml");
    const xml = sitemap.body.toString();
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1])).toEqual(
      listing === "on" ? [`${ORIGIN}/`] : [],
    );
    for (const privatePath of ["/profile", "/login", "/auth/", "/health", "/__data.json"]) {
      expect(xml).not.toContain(privatePath);
    }
  });

  test("private_pages_redirects_health_and_client_data_stay_out_of_search", async () => {
    for (const [path, status] of [
      ["/login", 200],
      ["/signed-out", 200],
      ["/profile", 303],
      ["/login/continue", 303],
      ["/auth/callback", 303],
      ["/health", 200],
      ["/__data.json", 200],
    ] as const) {
      const answer = await get(path);
      expect(answer.status, path).toBe(status);
      expect(answer.headers["x-robots-tag"], path).toBe("noindex");
      if (answer.headers["content-type"]?.includes("text/html")) {
        const html = answer.body.toString();
        expect(meta(html, "robots"), path).toBe("noindex");
        expect(
          tags(html, "link").filter((tag) => tag.rel === "canonical"),
          path,
        ).toHaveLength(0);
      }
    }
  });

  test("errors_and_refusals_never_inherit_the_homepages_index_permission", async () => {
    // Bun rejects a missing HTTP/1.1 Host before the application can attach headers; no page is served.
    expect((await get("/", { host: null })).status).toBe(400);
    const cases: [string, Options, number][] = [
      ["/", { host: "evil.example" }, 421],
      ["/", { method: "PUT", headers: { origin: ORIGIN, accept: "text/html" } }, 405],
      [
        "/",
        {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
        },
        403,
      ],
      ["/missing-page", { headers: { accept: "text/html" } }, 404],
    ];
    for (const [path, options, status] of cases) {
      const answer = await get(path, options);
      expect(answer.status, `${path} ${status}`).toBe(status);
      expect(answer.headers["x-robots-tag"], `${path} ${status}`).toBe("noindex");
      expect(answer.body.toString()).not.toContain('content="index, follow');
      expect(tags(answer.body.toString(), "link").filter((tag) => tag.rel === "canonical")).toHaveLength(0);
    }
  });

  test("the_sharing_image_is_public_and_matches_its_advertised_dimensions", async () => {
    const getImage = await get("/sharing/unset.png");
    expect(getImage.status).toBe(200);
    expect(getImage.headers["content-type"]).toContain("image/png");
    expect(getImage.headers["set-cookie"]).toBeUndefined();
    expect(getImage.body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(getImage.body.toString("ascii", 12, 16)).toBe("IHDR");
    expect(getImage.body.readUInt32BE(16)).toBe(1200);
    expect(getImage.body.readUInt32BE(20)).toBe(630);
    if (listing === "off") expect(getImage.headers["x-robots-tag"]).toBe("noindex");
    else expect(String(getImage.headers["x-robots-tag"] ?? "")).not.toMatch(/\b(?:noindex|none)\b/);
    const headImage = await get("/sharing/unset.png", { method: "HEAD" });
    expect(headImage.status).toBe(200);
    expect(headImage.headers["content-type"]).toBe(getImage.headers["content-type"]);
    expect(headImage.headers["x-robots-tag"]).toBe(getImage.headers["x-robots-tag"]);
    expect(Number(headImage.headers["content-length"])).toBe(getImage.body.length);
    expect(headImage.body.length).toBe(0);
  });

  test("failed_image_requests_do_not_gain_search_permission", async () => {
    const image = await get("/sharing/unset.png");
    const cases: [string, Options, number][] = [
      ["/sharing/unset.png", { host: "evil.example" }, 421],
      ["/sharing/missing.png", {}, 404],
      // sirv 3.0.2 build.mjs `send` returns 416 for a range starting past the actual file size.
      ["/sharing/unset.png", { headers: { range: `bytes=${image.body.length + 1}-` } }, 416],
    ];
    for (const [path, options, status] of cases) {
      const answer = await get(path, options);
      expect(answer.status, `${path} ${status}`).toBe(status);
      expect(answer.headers["x-robots-tag"], `${path} ${status}`).toBe("noindex");
    }
  });

  test("conditional_responses_send_the_current_search_policy", async () => {
    const home = await get("/");
    const favicon = tags(home.body.toString(), "link").find((tag) => tag.rel === "icon")?.href;
    if (!favicon) throw new Error("the built homepage has no favicon to exercise an unlisted static image");
    const faviconPath = new URL(favicon, ORIGIN).pathname;
    for (const path of ["/", "/signed-out", "/sharing/unset.png", faviconPath]) {
      const original = await get(path);
      expect(original.status, path).toBe(200);
      if (path === "/signed-out" || path === faviconPath || listing === "off") {
        expect(original.headers["x-robots-tag"], path).toBe("noindex");
      }
      const etag = original.headers.etag;
      if (typeof etag !== "string") throw new Error(`${path} has no ETag for conditional GET`);
      const unchanged = await get(path, { headers: { "if-none-match": etag } });
      expect(unchanged.status, path).toBe(304);
      expect(unchanged.body.length, path).toBe(0);
      // Kit 3.2.0 respond.js and sirv 3.0.2 build.mjs filter headers on 304. Send the current search policy so
      // RFC 9111 section 4.3.4 updates the stored decision, including when the launch setting has changed.
      expect(unchanged.headers["x-robots-tag"], path).toBe(original.headers["x-robots-tag"]);
    }
  });

  test("an_unchanged_image_updates_cached_policy_after_the_launch_setting_changes", async () => {
    // The same origin and built PNG, served with opposite settings, model a restart without changing image bytes.
    const prior = await sites[listing === "on" ? "off" : "on"].call("/sharing/unset.png");
    expect(prior.status).toBe(200);
    const etag = prior.headers.etag;
    if (typeof etag !== "string") throw new Error("the sharing image has no ETag for a launch-transition check");
    const unchanged = await get("/sharing/unset.png", { headers: { "if-none-match": etag } });
    expect(unchanged.status).toBe(304);
    expect(unchanged.body.length).toBe(0);
    expect(unchanged.headers["x-robots-tag"]).toBe(
      listing === "on" ? "index, follow, max-image-preview:large" : "noindex",
    );
    expect(unchanged.headers["x-robots-tag"]).not.toBe(prior.headers["x-robots-tag"]);
  });
});
