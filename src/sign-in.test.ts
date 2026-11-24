// Signing in, the profile and signing out, on the built server (`bun server.ts`, as production starts it) against a
// stand-in for backend that answers its documented shapes (api/internal/openapi.yaml at
// src/lib/server/backend/source.json's commit). The browser is played by hand: each request sends exactly the cookies
// a browser would, so every cookie the server sets or clears is checked. With no build this file fails, never skips.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..");
const HOST = "unset.test";
const ORIGIN = `https://${HOST}`;
const DID = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const AUTHORIZE = "https://pds.example/oauth/authorize?request_uri=urn%3Aexample";

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

let port = 0;
let web: ChildProcess;
let backend: Server;
let output = "";
let address = 0;
const clientAddress = () => `203.0.113.${(address++ % 250) + 1}`;

/** The stand-in backend's state: the nonce each sign-in started with, the live tokens, the profile, what it was sent. */
const state = {
  started: [] as { handle: string; nonce: string }[],
  tokens: new Set<string>(),
  displayName: undefined as string | undefined,
  calls: [] as { path: string; authorization: string | undefined; cookie: string | undefined; body: unknown }[],
  issued: 0,
  /** Set to make every route answer 500, as a backend that has failed. */
  broken: false,
};

const json = (status: number, body: unknown) => ({ status, body, type: "application/json" });
const problem = (status: number, code: string) => ({
  status,
  body: { type: "about:blank", title: "x", status, code },
  type: "application/problem+json",
});

/** Backend's internal API, as far as these tests need it. */
function answer(method: string, path: string, token: string | undefined, body: Record<string, string>) {
  if (state.broken) return problem(500, "failed");
  if (method === "POST" && path === "/auth/sign-in/atproto") {
    if (body.handle === "gone.example.com") return problem(400, "handle_not_found");
    state.started.push({ handle: body.handle ?? "", nonce: body.nonce ?? "" });
    return json(200, { url: AUTHORIZE });
  }
  if (method === "POST" && path === "/auth/sign-in/atproto/callback") {
    if (new URLSearchParams(body.query).get("error") === "access_denied") return problem(400, "consent_denied");
    if (!state.started.some((s) => s.nonce === body.nonce)) return problem(400, "state_mismatch");
    const issued = `t${state.issued++}${"x".repeat(31)}`;
    state.tokens.add(issued);
    return json(200, { sessionToken: issued });
  }
  const live = token !== undefined && state.tokens.has(token);
  if (method === "POST" && path === "/auth/sign-out") {
    if (!live) return problem(401, "no_session");
    state.tokens.delete(token);
    return { status: 204, body: undefined, type: "" };
  }
  if (!live) return problem(401, "no_session");
  if (method === "GET" && path === "/me/session") return json(200, { did: DID });
  const profile = () => ({
    did: DID,
    handle: "alice.example.com",
    ...(state.displayName ? { displayName: state.displayName } : {}),
  });
  if (method === "GET" && path === "/me/profile") return json(200, profile());
  if (method === "PATCH" && path === "/me/profile") {
    if ((body.displayName ?? "").length > 64) return problem(400, "name_too_long");
    state.displayName = body.displayName === "" ? undefined : body.displayName;
    return json(200, profile());
  }
  return problem(404, "not_found");
}

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

/** One browser: the cookies the server set it, sent back on each request as a browser would (all are host-only). */
class Browser {
  readonly jar = new Map<string, string>();

  async call(path: string, options: { method?: string; form?: Record<string, string> } = {}): Promise<Answer> {
    const body = options.form === undefined ? undefined : new URLSearchParams(options.form).toString();
    const headers: Record<string, string> = { host: HOST, "x-forwarded-for": clientAddress(), accept: "text/html" };
    if (this.jar.size > 0) headers.cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
    if (body !== undefined) {
      headers.origin = ORIGIN;
      headers["content-type"] = "application/x-www-form-urlencoded";
      headers["content-length"] = String(Buffer.byteLength(body));
    }
    const answer = await new Promise<Answer>((done, fail) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path,
          method: options.method ?? (body === undefined ? "GET" : "POST"),
          headers,
          setHost: false,
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            text += chunk;
          });
          res.on("end", () => done({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
        },
      );
      req.once("error", fail);
      req.end(body);
    });
    for (const line of setCookies(answer)) {
      const [pair = ""] = line.split(";");
      const at = pair.indexOf("=");
      const [name, value] = [pair.slice(0, at), pair.slice(at + 1)];
      if (/max-age=0/i.test(line) || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return answer;
  }
}

const setCookies = (answer: Answer): string[] => {
  const header = answer.headers["set-cookie"];
  return header === undefined ? [] : Array.isArray(header) ? header : [header];
};

/** The attributes the server gave cookie `name`, lowercased. */
const cookieLine = (answer: Answer, name: string) =>
  setCookies(answer)
    .find((line) => line.startsWith(`${name}=`))
    ?.toLowerCase();

beforeAll(async () => {
  if (!existsSync(join(WEB, "build", "handler.js"))) throw new Error("no build: run `bun run build` first");
  backend = createHttpServer((req, res) => {
    let text = "";
    req.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    req.on("end", () => {
      const authorization = req.headers.authorization;
      const body = text === "" ? {} : (JSON.parse(text) as Record<string, string>);
      const path = new URL(req.url ?? "/", "http://backend").pathname;
      state.calls.push({ path, authorization, cookie: req.headers.cookie, body });
      const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
      const out = answer(req.method ?? "GET", path, token, body);
      res.writeHead(out.status, out.type === "" ? {} : { "content-type": out.type });
      res.end(out.body === undefined ? undefined : JSON.stringify(out.body));
    });
  });
  const backendPort = await freePort();
  await new Promise<void>((done) => backend.listen(backendPort, "127.0.0.1", done));
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
      BACKEND_URL: `http://127.0.0.1:${backendPort}`,
    },
  });
  web.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  web.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  for (let tries = 0; ; tries += 1) {
    const ready = await new Browser().call("/health").then(
      (a) => a.status === 200,
      () => false,
    );
    if (ready) break;
    if (tries > 100 || web.exitCode !== null) throw new Error(`web did not start:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}, 30_000);

afterAll(() => {
  if (web.exitCode === null) web.kill("SIGKILL");
  backend.close();
});

beforeEach(() => {
  state.broken = false;
  state.calls.length = 0;
});

/** A browser that has signed in through the form and the callback. */
async function signedIn(): Promise<Browser> {
  const browser = new Browser();
  await browser.call("/login", { form: { handle: "alice.example.com" } });
  const nonce = browser.jar.get("__Host-oauth_nonce");
  expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const back = await browser.call("/auth/callback?code=c&state=s&iss=https%3A%2F%2Fpds.example");
  expect(back.status).toBe(303);
  return browser;
}

describe("signing in", () => {
  test("the_form_starts_a_sign_in_bound_to_this_browser_and_the_continue_page_moves_on", async () => {
    const browser = new Browser();
    expect((await browser.call("/login")).body).toContain('name="handle"');
    const posted = await browser.call("/login", { form: { handle: "  @Alice.Example.COM " } });
    expect(posted.status).toBe(303);
    expect(posted.headers.location).toBe("/login/continue");
    const nonce = browser.jar.get("__Host-oauth_nonce") ?? "";
    expect(state.started.at(-1)).toEqual({ handle: "alice.example.com", nonce });
    expect(cookieLine(posted, "__Host-oauth_nonce")).toMatch(/httponly.*secure.*samesite=lax|samesite=lax.*secure/);
    expect(cookieLine(posted, "__Host-login_target")).toContain("samesite=strict");
    // The authorization URL is never in a URL of ours.
    expect(posted.headers.location).not.toContain("pds.example");

    const page = await browser.call("/login/continue");
    expect(page.status).toBe(200);
    expect(page.body).toContain(`content="0;url=${AUTHORIZE.replaceAll("&", "&amp;")}"`);
    expect(page.headers["cache-control"]).toBe("private, no-store");
    // Another browser, without the Strict cookie, is sent back to start.
    const other = await new Browser().call("/login/continue");
    expect(other.headers.location).toBe("/login?error=login.expired");
  });

  test("the_callback_gives_a_session_cookie_and_the_profile", async () => {
    const browser = await signedIn();
    const token = browser.jar.get("__Host-sid") ?? "";
    expect(state.tokens.has(token)).toBe(true);
    expect(browser.jar.has("__Host-oauth_nonce")).toBe(false);
    const profile = await browser.call("/profile");
    expect(profile.status).toBe(200);
    expect(profile.body).toContain("@alice.example.com");
    expect(profile.body).toContain(DID);
    // Backend got the token as a bearer, never as a cookie.
    const reads = state.calls.filter((c) => c.path.startsWith("/me/"));
    expect(reads.every((c) => c.authorization === `Bearer ${token}` && c.cookie === undefined)).toBe(true);
    // A signed-in member has nothing to sign in to.
    expect((await browser.call("/login")).headers.location).toBe("/profile");
  });

  test("a_callback_in_a_browser_that_started_no_sign_in_never_reaches_backend", async () => {
    const answer = await new Browser().call("/auth/callback?code=c&state=s");
    expect(answer.headers.location).toBe("/login?error=login.state_mismatch");
    expect(state.calls).toEqual([]);
  });

  test("a_callback_with_another_browser's_nonce_is_refused_and_this_browser's_nonce_stays", async () => {
    const browser = new Browser();
    browser.jar.set("__Host-oauth_nonce", "Z".repeat(43));
    const answer = await browser.call("/auth/callback?code=c&state=s");
    expect(answer.headers.location).toBe("/login?error=login.state_mismatch");
    expect(browser.jar.has("__Host-sid")).toBe(false);
    expect(browser.jar.get("__Host-oauth_nonce")).toBe("Z".repeat(43));
  });

  test("refusals_go_back_to_the_form_with_their_text", async () => {
    const browser = new Browser();
    const typo = await browser.call("/login", { form: { handle: "not a handle" } });
    expect(typo.headers.location).toBe("/login?error=login.handle_invalid");
    const gone = await browser.call("/login", { form: { handle: "gone.example.com" } });
    expect(gone.headers.location).toBe("/login?error=login.handle_not_found");
    expect(browser.jar.has("__Host-oauth_nonce")).toBe(false);
    expect((await browser.call("/login?error=login.handle_not_found")).body).toContain("No account uses that handle.");

    await browser.call("/login", { form: { handle: "alice.example.com" } });
    const denied = await browser.call("/auth/callback?error=access_denied&state=s");
    expect(denied.headers.location).toBe("/login?error=login.consent_denied");
    expect(browser.jar.has("__Host-oauth_nonce")).toBe(false);
  });

  test("a_backend_that_fails_says_so_and_starts_nothing", async () => {
    state.broken = true;
    const browser = new Browser();
    const answer = await browser.call("/login", { form: { handle: "alice.example.com" } });
    expect(answer.headers.location).toBe("/login?error=login.failed");
    expect(browser.jar.size).toBe(0);
  });
});

describe("the profile", () => {
  test("a_visitor_goes_to_sign_in_and_a_stale_cookie_is_cleared", async () => {
    expect((await new Browser().call("/profile")).headers.location).toBe("/login");
    const stale = new Browser();
    stale.jar.set("__Host-sid", "gone");
    const answer = await stale.call("/profile");
    expect(answer.headers.location).toBe("/login");
    expect(cookieLine(answer, "__Host-sid")).toContain("max-age=0");
  });

  test("the_display_name_is_saved_and_a_refusal_is_shown", async () => {
    const browser = await signedIn();
    const saved = await browser.call("/profile", { form: { displayName: "  Alice  " } });
    expect(saved.status).toBe(200);
    expect(saved.body).toContain("Saved.");
    expect(state.displayName).toBe("Alice");
    const long = await browser.call("/profile", { form: { displayName: "a".repeat(65) } });
    expect(long.status).toBe(400);
    expect(long.body).toContain("Part of your profile is too long.");
    expect(state.displayName).toBe("Alice");
  });

  test("a_session_backend_ended_sends_the_member_to_sign_in", async () => {
    const browser = await signedIn();
    state.tokens.clear();
    const answer = await browser.call("/profile");
    expect(answer.headers.location).toBe("/login");
    expect(browser.jar.has("__Host-sid")).toBe(false);
  });

  test("a_backend_that_fails_is_unavailable_and_keeps_the_cookie", async () => {
    const browser = await signedIn();
    state.broken = true;
    const answer = await browser.call("/profile");
    expect(answer.status).toBe(503);
    expect(browser.jar.has("__Host-sid")).toBe(true);
  });
});

describe("signing out", () => {
  test("ends_this_browser's_session_only", async () => {
    const [here, there] = [await signedIn(), await signedIn()];
    const answer = await here.call("/logout", { form: {} });
    expect(answer.status).toBe(303);
    expect(answer.headers.location).toBe("/signed-out");
    expect(answer.headers["clear-site-data"]).toBe('"storage"');
    expect(here.jar.has("__Host-sid")).toBe(false);
    expect((await here.call("/profile")).headers.location).toBe("/login");
    expect((await there.call("/profile")).status).toBe(200);
    expect((await here.call("/signed-out")).body).toContain("You are signed out of Unset");
  });

  test("a_failed_sign_out_is_a_retryable_503_and_keeps_the_cookie", async () => {
    const browser = await signedIn();
    state.broken = true;
    const answer = await browser.call("/logout", { form: {} });
    expect(answer.status).toBe(503);
    expect(answer.body).toContain("<title>service.unavailable</title>");
    expect(browser.jar.has("__Host-sid")).toBe(true);
  });

  test("a_link_or_another_site_cannot_sign_a_member_out", async () => {
    const browser = await signedIn();
    expect((await browser.call("/logout")).status).toBe(405);
    expect(browser.jar.has("__Host-sid")).toBe(true);
  });

  test("a_new_sign_in_ends_the_session_this_browser_held", async () => {
    const browser = await signedIn();
    const first = browser.jar.get("__Host-sid") ?? "";
    await browser.call("/login", { form: { handle: "alice.example.com" } });
    // Signed in already: the form sends the member to the profile and starts nothing.
    expect(browser.jar.get("__Host-sid")).toBe(first);
    browser.jar.set("__Host-oauth_nonce", state.started.at(-1)?.nonce ?? "");
    await browser.call("/auth/callback?code=c&state=s");
    expect(browser.jar.get("__Host-sid")).not.toBe(first);
    expect(state.tokens.has(first)).toBe(false);
  });
});

test("logs_carry_no_token_did_or_handle", () => {
  for (const secret of [...state.tokens, DID, "alice.example.com"]) expect(output).not.toContain(secret);
});
