// The request gate on the built server, started as production starts it (`bun server.ts` over adapter-node's build),
// never under `vite dev`. Cases drawn from the old app's tests/integration/web/gate.test.ts for the parts this step
// moves: the host check, the headers, the per-group CSP, the method and body checks, the address limit, the log line
// and the drain. `bun run check` builds before it tests; with no build this file fails, it never skips.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..");
const HOST = "unset.test";
const ORIGIN = `https://${HOST}`;

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

let port = 0;
let web: ChildProcess;
let output = "";
let address = 0;
/** A fresh client address the trusted proxy names, so no test shares another's bucket. */
const clientAddress = () => `198.51.100.${(address++ % 250) + 1}`;

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const found = (server.address() as { port: number }).port;
      server.close(() => done(found));
    });
  });
}

/** One request over loopback, with the Host and headers given exactly (fetch would set its own Host). */
function call(path: string, options: { method?: string; host?: string | null; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": clientAddress(), ...options.headers };
  if (options.host !== null) headers.host = options.host ?? HOST;
  return new Promise<Answer>((done, fail) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: options.method ?? "GET", headers, setHost: false },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => done({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.once("error", fail);
    req.end();
  });
}

beforeAll(async () => {
  if (!existsSync(join(WEB, "build", "handler.js"))) throw new Error("no build: run `bun run build` first");
  port = await freePort();
  web = spawn("bun", ["server.ts"], {
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
      // Nothing listens there: no gate test reaches backend.
      BACKEND_URL: "http://127.0.0.1:9",
    },
  });
  web.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  web.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  for (let tries = 0; ; tries += 1) {
    const ready = await call("/health").then(
      (answer) => answer.status === 200,
      () => false,
    );
    if (ready) break;
    if (tries > 100 || web.exitCode !== null) throw new Error(`web did not start:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}, 30_000);

afterAll(() => {
  if (web.exitCode === null) web.kill("SIGKILL");
});

const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-robots-tag": "noindex",
};

describe("hosts and headers", () => {
  test("only_our_hosts_are_served_files_included", async () => {
    for (const path of ["/", "/robots.txt", "/nothing-here"]) {
      expect((await call(path, { host: "evil.example" })).status).toBe(421);
      expect((await call(path, { host: `${HOST}.evil.example` })).status).toBe(421);
    }
    expect((await call("/", { host: null })).status).toBe(400);
    expect((await call("/", { host: `${HOST}:8080` })).status).toBe(200);
  });

  test("health_skips_the_host_check_and_says_only_service_and_commit", async () => {
    const answer = await call("/health", { host: "anything.example" });
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({ status: "ok", service: "web", commit: "c".repeat(40) });
    expect(answer.headers["cache-control"]).toBe("no-store");
  });

  test("every_response_carries_the_security_headers", async () => {
    for (const answer of [
      await call("/"),
      await call("/robots.txt"),
      await call("/nothing-here"),
      await call("/", { host: "evil.example" }),
      await call("/", { method: "PUT" }),
    ]) {
      for (const [name, value] of Object.entries(SECURITY)) expect(answer.headers[name], name).toBe(value);
      expect(answer.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(answer.headers["x-sveltekit-page"]).toBeUndefined();
    }
  });
});

describe("csp", () => {
  test("a_page_that_runs_no_script_allows_none_and_ships_none", async () => {
    const answer = await call("/signed-out");
    expect(answer.status).toBe(200);
    const csp = String(answer.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("script-src");
    expect(answer.body).not.toContain("<script");
  });

  test("a_page_loads_brand_styles_and_fonts_from_the_build_only", async () => {
    const answer = await call("/");
    const csp = String(answer.headers["content-security-policy"]);
    expect(csp).toContain(`style-src ${ORIGIN}/_app/`);
    expect(csp).toContain(`font-src ${ORIGIN}/_app/`);
    const sheets = [...answer.body.matchAll(/<link href="([^"]+)" rel="stylesheet">/g)].map((m) => m[1]);
    expect(sheets.length).toBeGreaterThan(0);
    const fonts: (string | undefined)[] = [];
    for (const sheet of sheets) {
      expect(sheet).toMatch(/^\/?(\.\/)?_app\/immutable\/assets\/[\w.-]+\.css$/);
      const css = await call(`/${String(sheet).replace(/^\.?\//, "")}`);
      expect(css.status).toBe(200);
      // Relative to the sheet, so under /_app/immutable/assets/ too.
      fonts.push(...[...css.body.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]));
    }
    // Route-specific sheets need no fonts of their own; the shared brand sheet supplies them.
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font).toMatch(/^\.\/[\w.-]+\.woff2$/);
  });

  test("a_file_gets_the_static_policy", async () => {
    expect((await call("/robots.txt")).headers["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});

describe("requests", () => {
  test("only_get_head_and_post_are_allowed", async () => {
    // A mutating request with no content type and another origin is SvelteKit's CSRF 403 first (kit 3.2.0
    // src/runtime/server/csrf.js); from our own origin it reaches the gate.
    expect((await call("/", { method: "PUT" })).status).toBe(403);
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const answer = await call("/", { method, headers: { origin: ORIGIN } });
      expect(answer.status).toBe(405);
      expect(answer.headers.allow).toBe("GET, HEAD, POST");
    }
  });

  test("a_route_that_takes_no_body_refuses_a_post", async () => {
    const answer = await call("/", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded", "content-length": "0" },
    });
    expect(answer.status).toBe(405);
    expect(answer.headers.allow).toBe("GET, HEAD");
  });

  test("a_form_post_from_another_origin_is_refused_before_the_hook", async () => {
    const answer = await call("/", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
    });
    expect(answer.status).toBe(403);
  });

  test("a_refusal_a_browser_asked_a_page_for_is_a_page", async () => {
    const page = await call("/", { method: "PUT", headers: { origin: ORIGIN, accept: "text/html" } });
    expect(page.status).toBe(405);
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(page.body).toContain("<code>http.method_not_allowed</code>");
    expect(page.body).not.toContain("<script");
    const plain = await call("/", { method: "PUT", headers: { origin: ORIGIN } });
    expect(plain.body).toBe("http.method_not_allowed\n");
  });
});

describe("limits", () => {
  test("a_client_address_over_its_limit_gets_429", async () => {
    const from = { "x-forwarded-for": "203.0.113.9" };
    const statuses = [];
    for (let i = 0; i < 61; i += 1) statuses.push((await call("/", { headers: from })).status);
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    const refused = await call("/", { headers: from });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
  });

  test("health_is_never_rate_limited", async () => {
    const from = { "x-forwarded-for": "203.0.113.10" };
    for (let i = 0; i < 70; i += 1) expect((await call("/health", { headers: from })).status).toBe(200);
  });
});

describe("policies and logs", () => {
  test("every_route_has_a_policy", () => {
    const routes = join(WEB, "src", "routes");
    const folders = new Set<string>();
    for (const file of readdirSync(routes, { recursive: true, encoding: "utf8" })) {
      const name = file.split("/").at(-1) ?? "";
      if (/^\+(page|server)\./.test(name)) folders.add(file.slice(0, -name.length));
    }
    expect(folders.size).toBeGreaterThan(0);
    for (const folder of folders) expect(existsSync(join(routes, folder, "policy.ts")), folder).toBe(true);
  });

  test("every_response_is_logged_without_address_or_path", async () => {
    await call("/a-path-that-names-someone?handle=alice.example.com", { headers: { "x-forwarded-for": "192.0.2.77" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const lines = output.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      expect(record.svc).toBe("web");
    }
    expect(output).toContain('"route":"/unmatched"');
    for (const leak of ["192.0.2.77", "198.51.100.", "alice", "a-path-that-names-someone", "evil.example"]) {
      expect(output).not.toContain(leak);
    }
  });

  test("the_process_drains_and_exits_0", async () => {
    const exited = new Promise<number | null>((done) => web.once("exit", (code) => done(code)));
    web.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(output).toContain('"event":"http.drain"');
  });
});
