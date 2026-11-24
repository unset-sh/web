// The request gate of the web process, adapted from the old app's hooks.server.ts (its ADR 0054 and ADR 0056).
// SvelteKit keeps its own Origin check on form posts (it runs before this hook; kit 3.2.0 src/runtime/server/respond.js)
// and the body cap (adapter-node BODY_SIZE_LIMIT, set by server.ts). server.ts does what every response needs, files
// and SvelteKit's early refusals included: the host check, the base headers, the log line and the drain. This hook
// adds, in order: the route's policy (none = refused), form-only bodies, the body size, the client address and its
// limit, then the route under its deadline, and last the response's CSP: SvelteKit's own, narrowed, on an app page;
// the group's fixed one on everything else. Every check fails closed. Kit docs: https://svelte.dev/docs/kit/hooks
// (3.2.0). The session part of the old gate comes with sign-in.
import { randomUUID } from "node:crypto";
import { isRedirect, type RequestEvent } from "@sveltejs/kit";
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { building, dev } from "$app/env";
import { AppError, ERROR_CODES } from "./lib/errors/index.ts";
import { services, startServices } from "./lib/server/compose.ts";
import { narrowed, zeroScriptCsp } from "./lib/server/csp.ts";
import { type ClientIp, createClientIpResolver } from "./lib/server/http/index.ts";
import type { PolicyName } from "./lib/server/limits.ts";
import type { PageGroup, RoutePolicy } from "./lib/server/policy.ts";
import { refusalPage, wantsPage } from "./lib/server/refusal-page.ts";
import { policyOf } from "./lib/server/route-table.ts";
import { config, requestNote, stylesheet } from "./lib/server/runtime.ts";

/** Only these bodies are accepted. SvelteKit's Origin check covers exactly the form types, so refusing every other
 * type here puts every POST under that check. */
const FORM_TYPES = new Set(["application/x-www-form-urlencoded", "multipart/form-data"]);
const UNTRUSTED_PEER_LOG_MS = 60_000;

const ZERO_SCRIPT = zeroScriptCsp(config.PUBLIC_ORIGIN);

let untrustedLoggedAt = Number.NEGATIVE_INFINITY;
const clientIpOf = createClientIpResolver(config, () => {
  if (performance.now() - untrustedLoggedAt < UNTRUSTED_PEER_LOG_MS) return;
  untrustedLoggedAt = performance.now();
  services().log.warn("proxy.untrusted_peer", {});
});

/** The gate's refusals and their codes, so `handle` can answer a browser's document request with the page. */
const REFUSALS = new WeakMap<Response, string>();

function plain(status: number, code: string, headers: Record<string, string> = {}): Response {
  const response = new Response(`${code}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
  REFUSALS.set(response, code);
  return response;
}

/** Checks on the request itself, before anyone is identified: method, body type and declared size. */
function requestProblem(request: Request, policy: RoutePolicy): Response | undefined {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (request.method !== "POST") return plain(405, "http.method_not_allowed", { allow: "GET, HEAD, POST" });
  if (policy.maxBody === undefined) return plain(405, "http.method_not_allowed", { allow: "GET, HEAD" });
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!FORM_TYPES.has(type)) return plain(415, "http.unsupported_media_type");
  // A body with no declared length (chunked) is refused; BODY_SIZE_LIMIT still counts what is read.
  const length = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(length) || length > policy.maxBody)
    return plain(413, "http.payload_too_large", { connection: "close" });
  return undefined;
}

/** The policy this request counts against: a POST uses the route's write policy when it has one. */
const limitOf = (request: Request, policy: RoutePolicy): PolicyName =>
  request.method === "POST" && policy.writeLimit !== undefined ? policy.writeLimit : policy.limit;

function limited(name: PolicyName, subject: { ip: ClientIp | null } | { did: string }): Response | undefined {
  const verdict = services().limiter.consume(name, subject);
  return verdict.ok ? undefined : plain(429, "http.rate_limited", { "retry-after": String(verdict.retryAfterS) });
}

/** The gate, in order; a Response means the request stops there. */
const gate: Handle = async ({ event, resolve }) => {
  const policy = policyOf(event.route.id);
  if (policy === undefined) {
    services().log.error("error", { code: "internal.error", route: "/unlisted" }); // a route with no policy.ts: refuse, never guess
    return plain(500, "internal.error");
  }
  const problem = requestProblem(event.request, policy);
  if (problem) return problem;
  const byIp = policy.probe
    ? undefined
    : limited(limitOf(event.request, policy), { ip: clientIpOf(event.request.headers, event.getClientAddress()) });
  if (byIp) return byIp;
  return withDeadline(event, policy, () => resolve(event));
};

/** The route runs under its deadline; past it the visitor gets 503 and a late result is logged, never sent. */
async function withDeadline(
  event: RequestEvent,
  policy: RoutePolicy,
  run: (deadline: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const ms = policy.deadlineMs ?? config.REQUEST_DEADLINE_MS;
  const deadline = AbortSignal.timeout(ms);
  event.locals.deadline = deadline; // loads and actions pass it to every call they make
  const result = run(deadline);
  const timedOut = new Promise<"deadline">((done) =>
    deadline.addEventListener("abort", () => done("deadline"), { once: true }),
  );
  const outcome = await Promise.race([result, timedOut]);
  if (outcome !== "deadline") return outcome;
  const { log } = services();
  const route = event.route.id ?? "/unmatched";
  log.warn("http.deadline", { route, reqId: event.locals.reqId });
  result.then(
    () => log.warn("http.late_result", { route, reqId: event.locals.reqId }),
    () => log.warn("http.late_result", { route, reqId: event.locals.reqId }),
  );
  return plain(503, "http.deadline");
}

/**
 * Builds every service before the first request: adapter-node awaits this while its handler is imported, so a failure
 * stops the process before server.ts listens (kit 3.2.0 src/runtime/server/instance.js `init`;
 * https://svelte.dev/docs/kit/hooks#Shared-hooks-init). Not while building.
 */
export const init: ServerInit = () => {
  if (!building) startServices();
};

/**
 * What the gate answers for an error it caught: a catalog failure a page may show (a deadline: 503) keeps its own
 * status and code, so the visitor is told to try again; anything else is 500 internal.error. Only the code is sent,
 * never the error's message or cause.
 */
function caughtResponse(error: unknown): Response {
  if (error instanceof AppError && ERROR_CODES[error.code].public) return plain(error.status, error.code);
  return plain(500, "internal.error");
}

/** The gate's outcome, an unexpected error as a code, and the group's CSP. server.ts writes the log line. */
export const handle: Handle = async (input) => {
  const { event } = input;
  const note = requestNote() ?? { reqId: randomUUID() };
  note.route = event.route.id ?? "/unmatched";
  event.locals.reqId = note.reqId;
  let response: Response;
  try {
    response = await gate(input);
  } catch (error) {
    if (isRedirect(error)) throw error; // SvelteKit builds it; server.ts still gives it the headers and the log line
    services().log.logError(error);
    response = caughtResponse(error);
  }
  const group = policyOf(event.route.id)?.group ?? "static";
  const refused = REFUSALS.get(response);
  if (refused !== undefined && wantsPage(event.request, event.isDataRequest)) {
    const styled = group === "app" || group === "public";
    response = refusalPage(refused, response.status, response.headers, styled ? stylesheet() : undefined);
    // A styled refusal page runs no script and loads only the build's styles and our fonts: the public policy. The app
    // group's fallback (default-src 'none') would block its stylesheet.
    if (styled) return withGroupHeaders(response, group, event.isDataRequest, "public");
  }
  return withGroupHeaders(response, group, event.isDataRequest);
};

/**
 * An `app` page keeps SvelteKit's CSP, narrowed to our paths; every other response gets its group's fixed one. An
 * `app` page, and the data its client loads (__data.json), may differ per member, so it is private, never stored and
 * varies on Cookie. So is any response that sets a cookie, whatever the page asked for.
 */
function withGroupHeaders(
  response: Response,
  group: PageGroup,
  dataRequest: boolean,
  cspGroup: PageGroup = group,
): Response {
  const out = new Response(response.body, response); // SvelteKit's own responses may have immutable headers
  const html = out.headers.get("content-type")?.startsWith("text/html") === true;
  // A redirect is never stored (a 303 is not cacheable without explicit freshness anyway, RFC 9110 §15.4.4; this
  // keeps it so behind any cache).
  if (out.status >= 300 && out.status < 400 && !out.headers.has("cache-control")) {
    out.headers.set("cache-control", "no-store");
  }
  if ((group === "app" && (html || dataRequest)) || out.headers.has("set-cookie")) {
    out.headers.set("cache-control", "private, no-store");
    out.headers.append("vary", "Cookie");
  }
  const kit = out.headers.get("content-security-policy");
  out.headers.set("content-security-policy", kit !== null && group === "app" ? kitPolicy(kit) : ZERO_SCRIPT[cspGroup]);
  return out;
}

/**
 * SvelteKit's own policy for a page that runs its client, narrowed to our paths. Under `vite dev` Vite serves files
 * from other paths, so 'self' stays (old app ADR 0054 decision 5).
 */
const kitPolicy = (kit: string): string => (dev ? kit : narrowed(kit, config.PUBLIC_ORIGIN));

/**
 * An error a route did not answer itself. SvelteKit's own (a 404, a bad request) is shown by its code with nothing
 * logged; anything else is logged by code and class only, and the page shows a code and the request id, never the
 * message (kit 3.2.0 types: CaughtError's `kind`).
 */
export const handleError: HandleServerError = (caught) => {
  if (caught.kind === "framework" || caught.kind === "validation")
    return { message: caught.error.status === 404 ? "http.not_found" : "http.bad_request" };
  if (caught.kind === "app") return caught.error;
  services().log.logError(caught.error);
  return { message: "internal.error", reqId: caught.event.locals.reqId };
};
