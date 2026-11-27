// The web process's entry point, from the old app's interfaces/web/server.ts, run with `bun server.ts`:
// adapter-node's documented custom server (https://svelte.dev/docs/kit/adapter-node, "Custom server"; adapter-node
// 6.0.2) around the built `handler`, on Bun's node:http. adapter-node serves the build's files and SvelteKit
// sends its own CSRF 403 before hooks.server.ts runs (adapter-node files/handler.js serve_static; kit 3.2.0
// src/runtime/server/respond.js), so what every response needs lives here, whatever produced it: the host check, the
// security headers and the one log line. Headers are set before the handler; a header the app sets itself (a page's
// CSP) replaces ours, because Node merges setHeader values into writeHead and the later write wins. We own listen and
// the drain (src/lib/server/http/shutdown.ts). Settings load first and exit 78 when invalid.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { BODY_CAP } from "./src/lib/server/body-cap.ts";
import { bootOrExit, exitOnConfigError } from "./src/lib/server/config/index.ts";
import { schema } from "./src/lib/server/config.ts";
import { STATIC_CSP } from "./src/lib/server/csp.ts";
import { drain, exitOnSignals, hostAllowed, SECURITY_HEADERS } from "./src/lib/server/http/index.ts";
import { createLogger, type LogFields } from "./src/lib/server/log/index.ts";
import { NOTE_KEY, type ProcessNote, type RequestNote } from "./src/lib/server/note.ts";
import { DEFAULT_SHARE_IMAGE_PATH } from "./src/lib/server/seo.ts";

const config = bootOrExit(schema);
const log = createLogger({ service: "web", commit: config.UNSET_COMMIT, env: config.UNSET_ENV });
// Last resort: without these the runtime prints the raw error past the scrubbing logger, and a library message can
// carry a DID or handle. A rejection drains as on SIGTERM; an uncaught exception exits 1 at once (not safe to resume:
// Node doc/api/process.md, 'uncaughtException', which Bun follows).
process.on("unhandledRejection", (reason: unknown) => {
  log.logError(reason);
  process.kill(process.pid, "SIGTERM");
});
process.on("uncaughtException", (error: unknown) => {
  log.logError(error);
  process.exit(1);
});
/** The path SvelteKit's build stylesheet is served at, kept only in the form the build writes it. */
const BUILD_STYLESHEET = /^_app\/immutable\/assets\/[\w.-]+\.css$/;

/**
 * The app's stylesheet, read once from SvelteKit's build manifest (`#kit/manifest`, package.json "imports"), for the
 * gate's refusal page. Under output.bundleStrategy "split" kit 3.2.0 lists no stylesheet in
 * `manifest.client`; the one Tailwind sheet belongs to the root layout, node 0, whose module exports `stylesheets`
 * (build/server/nodes/0.js). Loading that node loads the root layout's code, which reads the process note, so this runs
 * after the handler has loaded. Without it the page is plain, which is all a missing or odd entry costs; gate.test.ts
 * checks the built server has it.
 */
async function buildStylesheet(): Promise<string | undefined> {
  try {
    const { manifest } = await import("#kit/manifest");
    const sheets = (await manifest?.nodes?.[0]?.())?.stylesheets;
    const first: unknown = Array.isArray(sheets) ? sheets[0] : undefined;
    return typeof first === "string" && BUILD_STYLESHEET.test(first) ? `/${first}` : undefined;
  } catch {
    // Any shape the manifest or node 0 takes, thrown or rejected, only leaves the refusal page plain.
    return undefined;
  }
}

const note: ProcessNote = {
  config,
  requests: new AsyncLocalStorage<RequestNote>(),
  shutdown: { draining: [], close: [] },
};
(globalThis as Record<symbol, unknown>)[NOTE_KEY] = note;

// adapter-node reads these when its handler loads (adapter-node files/env.js): the origin for the request URL and
// SvelteKit's Origin check, and the cap on any request body, the largest route's maxBody (body-cap.ts says why).
// Ours come from config and the route table, never from the environment raw.
process.env.ORIGIN = config.PUBLIC_ORIGIN;
process.env.BODY_SIZE_LIMIT = String(BODY_CAP);

/**
 * Loaded after the note is published; `#kit/handler` is the build's handler.js (package.json "imports", typed by
 * kit-handler.d.ts so the type checker does not walk the build output). Loading it runs the `init` hook, which builds
 * the services: a connection budget the role cannot hold is a ConfigError (exit 78), and any other failure is logged
 * by class only (SE-7) and exits 1 before we listen.
 */
const { handler } = await import("#kit/handler").catch((error: unknown): never => {
  try {
    exitOnConfigError(error);
  } catch {
    log.logError(error);
  }
  process.exit(1);
});
note.stylesheet = await buildStylesheet();

/**
 * Every response starts noindex. Only a successful public page explicitly approved by hooks.server.ts may replace
 * it when SEARCH_LISTING is on. The fixed brand image has a separate explicit opt-in below; other files, redirects
 * and refusals that bypass the hook remain excluded.
 */
const BASE_HEADERS = {
  "content-security-policy": STATIC_CSP,
  ...SECURITY_HEADERS,
  "x-robots-tag": "noindex",
};

const METHODS: readonly NonNullable<LogFields["method"]>[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];
const methodField = (method = ""): Pick<LogFields, "method"> => {
  const known = METHODS.find((m) => m === method);
  return known === undefined ? {} : { method: known };
};

const pathOf = (req: IncomingMessage): string => (req.url ?? "").split("?")[0] ?? "";
const isProbe = (req: IncomingMessage) => pathOf(req) === "/health";

/**
 * A page's data address: SvelteKit answers `<page>/__data.json` for every page route with the result of its server
 * loads, whatever `csr` says (kit 3.2.0 src/pathname.js `has_data_suffix`, these two suffixes). It is
 * never a search result, so every answer there says noindex whatever its page says: the page's own X-Robots-Tag is
 * set by the page's load, which does not run when the client asks for the layout alone or when the gate redirects.
 */
const DATA_SUFFIXES = ["/__data.json", ".html__data.json"];
const isDataAddress = (req: IncomingMessage) => DATA_SUFFIXES.some((suffix) => pathOf(req).endsWith(suffix));

/** The request's host, lowercase and without its port; undefined when absent or malformed. */
function hostOf(req: IncomingMessage): string | undefined {
  const raw = req.headers.host;
  if (raw === undefined || raw === "" || !URL.canParse(`http://${raw}`)) return undefined;
  return new URL(`http://${raw}`).hostname.toLowerCase();
}

/** SvelteKit marks page responses with `x-sveltekit-page`; it tells a visitor nothing they need, so it never leaves. */
function hideFramework(res: ServerResponse): void {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => (name.toLowerCase() === "x-sveltekit-page" ? res : setHeader(name, value));
}

/**
 * A 304 carries no CSP. SvelteKit builds its 304 after hooks.server.ts, from a fixed list of the 200's headers (kit
 * 3.2.0 src/runtime/server/respond.js: etag, cache-control, content-location, date, expires, vary, set-cookie), so the
 * page's own CSP is dropped and our static one would show through. A browser merges a 304's headers into the stored
 * response (RFC 9111 §4.3.4), so the page would then run under the static CSP and its stylesheet and fonts be blocked.
 * With none on the 304, the stored 200's CSP stays.
 */
function keepStoredCsp(res: ServerResponse, request: RequestNote): void {
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
  res.writeHead = ((status: number, ...rest: unknown[]) => {
    if (status >= 300 && status !== 304) res.setHeader("x-robots-tag", "noindex");
    if (status === 304) {
      res.removeHeader("content-security-policy");
      // Kit filters page headers on 304. Send the current indexing decision so a launch-setting change takes
      // effect even when the body/ETag is unchanged. The static brand image already has its current policy.
      if (config.SEARCH_LISTING === "on" && request.searchVisible === true) {
        res.setHeader("x-robots-tag", "index, follow, max-image-preview:large");
      }
    }
    return writeHead(status, ...rest);
  }) as ServerResponse["writeHead"];
}

let inFlight = 0;

function serve(req: IncomingMessage, res: ServerResponse): void {
  const started = performance.now();
  const request: RequestNote = { reqId: randomUUID() };
  inFlight += 1;
  res.on("close", () => {
    inFlight -= 1;
    // The hook names the route it handled; anything else is a file or a refusal SvelteKit sent before the hook.
    log.info("http.request", {
      route: request.route ?? "/unrouted",
      ...methodField(req.method),
      status: res.statusCode,
      ms: Math.round(performance.now() - started),
      reqId: request.reqId,
    });
  });
  for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
  // This fixed identity asset contains no member data. Other files remain excluded by default. Errors below
  // reset this permission in writeHead; a missing file or hostile Host must never become an indexable response.
  if (
    config.SEARCH_LISTING === "on" &&
    pathOf(req) === DEFAULT_SHARE_IMAGE_PATH &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    res.setHeader("x-robots-tag", "index, follow, max-image-preview:large");
  }
  if (isDataAddress(req)) res.setHeader("x-robots-tag", "noindex");
  hideFramework(res);
  keepStoredCsp(res, request);
  if (!isProbe(req)) {
    const host = hostOf(req);
    if (host === undefined || !hostAllowed(host, config.HTTP_ALLOWED_HOSTS)) {
      res.writeHead(host === undefined ? 400 : 421, { "content-type": "text/plain; charset=utf-8" });
      res.end(host === undefined ? "http.bad_request\n" : "http.misdirected\n");
      return;
    }
  }
  note.requests.run(request, () => handler(req, res, () => res.writeHead(404).end("http.not_found\n")));
}

const server = createServer(serve);
server.once("error", () => {
  log.error("http.listen_failed", { kind: "listen" });
  process.exit(1);
});
server.listen(config.LISTEN_PORT, () => {
  exitOnSignals(async () => {
    log.info("http.drain", { phase: "start" });
    for (const step of note.shutdown.draining) step();
    const code = await drain(server, {
      graceMs: config.SHUTDOWN_GRACE_MS,
      inFlight: () => inFlight,
      hooks: note.shutdown.close,
    });
    log.info("http.drain", { phase: code === 0 ? "done" : "timeout" });
    return code;
  }, process.exit);
});
