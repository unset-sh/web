// Signing in, adapted from the old app (Undefined6799/unset at 60228f5, interfaces/web/src/lib/server/sign-in.ts and
// oauth-callback.ts). POST /login makes a nonce, keeps it in this browser's cookie and asks backend to start the
// authorization with it; the authorization URL waits for /login/continue in a Strict cookie, never in the query, so
// that page only sends a browser where its own POST pointed it. The callback sends the cookie's nonce back with the
// query, and backend refuses a callback another browser started. Nothing here holds a grant: backend does.
import { type Cookies, redirect } from "@sveltejs/kit";
import { type ErrorCode, withErrorParam } from "../../errors/index.ts";
import { services } from "../compose.ts";
import { config } from "../runtime.ts";
import {
  cookieValue,
  decodeTarget,
  dropCookie,
  encodeTarget,
  NONCE,
  newNonce,
  putCookie,
  safeTarget,
} from "./cookies.ts";
import { typedHandle } from "./handle.ts";

/** The longest callback query backend takes (its CallbackBody). */
const MAX_QUERY = 4096;

/** Back to the sign-in form with `code`. Throws SvelteKit's 303 (cookies already set go with it). */
export function back(code: ErrorCode): never {
  redirect(303, withErrorParam("/login", code));
}

/** The one value of `name`, or null when it is missing, repeated or a file. */
export function single(form: FormData, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

/** The authorization URL as a link this site may send a browser to; plain http only on a dev stack. */
const allowed = (text: string): string | null => safeTarget(text, config.UNSET_ENV === "dev");

/** POST /login after the gate: the handle, the nonce, the authorization, then the two cookies. Always throws a 303. */
export async function startSignIn(request: Request, cookies: Cookies, deadline: AbortSignal): Promise<never> {
  const form = await request.formData();
  const handle = typedHandle(single(form, "handle") ?? "");
  if (handle === null) back("login.handle_invalid");
  const nonce = newNonce();
  const started = await services().accounts.startSignIn(handle, nonce, deadline);
  if (!started.ok) back(started.code);
  const target = allowed(started.url);
  if (target === null) {
    services().log.warn("oauth.authorize_failed", { kind: "insecure_target" });
    back("login.failed");
  }
  putCookie(cookies, "nonce", nonce);
  putCookie(cookies, "target", encodeTarget(target));
  redirect(303, "/login/continue");
}

/** The target this browser's POST stored, if it is still a link this site may send it to. */
export function storedTarget(request: Request): string | null {
  const encoded = cookieValue(request.headers.get("cookie"), "target");
  return encoded === null ? null : allowed(decodeTarget(encoded));
}

/**
 * GET /auth/callback: the query and this browser's nonce go to backend, which answers a session token or a refusal.
 * A browser that holds no nonce started no sign-in here, so backend is not asked and no grant is made. A refusal
 * goes back to the form with its code; only `state_mismatch` keeps the nonce cookie, since it may be another tab's
 * live sign-in. Always throws a 303.
 */
export async function completeSignIn(request: Request, cookies: Cookies, deadline: AbortSignal): Promise<never> {
  const { accounts, log } = services();
  const query = new URL(request.url).search.slice(1);
  const nonce = cookieValue(request.headers.get("cookie"), "nonce");
  if (nonce === null || !NONCE.test(nonce)) back("login.state_mismatch");
  if (query === "" || query.length > MAX_QUERY) {
    dropCookie(cookies, "nonce");
    back("login.expired");
  }
  const completed = await accounts.completeSignIn(query, nonce, deadline);
  if (!completed.ok) {
    if (completed.code !== "login.state_mismatch") dropCookie(cookies, "nonce");
    log.info("auth.login_denied", { code: completed.code });
    back(completed.code);
  }
  // A session this browser held before ends now: one browser, one session. Best effort, so a failure here never costs
  // the member the sign-in; backend's expiry ends it otherwise.
  const replaced = cookieValue(request.headers.get("cookie"), "session");
  if (replaced !== null && replaced !== completed.token) {
    await accounts.signOut(replaced, deadline).catch(() => log.warn("auth.replaced_session_kept", {}));
  }
  dropCookie(cookies, "nonce");
  dropCookie(cookies, "target");
  putCookie(cookies, "session", completed.token);
  log.info("auth.login_succeeded", {});
  redirect(303, "/profile");
}
