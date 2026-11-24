// POST /logout, adapted from the old app's sign-out (Undefined6799/unset at 60228f5, lib/server/sign-out.ts). This
// browser's session ends; other browsers keep theirs, and backend ends the grant with the last one (Alex,
// 2026-11-24). A failure is a retryable 503 and the cookie stays, so the retry finds it.
import { error, type RequestHandler, redirect } from "@sveltejs/kit";
import { AppError, ERROR_CODES } from "#lib/errors/index.ts";
import { services } from "#lib/server/compose.ts";
import { cookieValue, dropCookie } from "#lib/server/sign-in/cookies.ts";

export const POST: RequestHandler = async ({ request, cookies, locals, setHeaders }) => {
  const token = cookieValue(request.headers.get("cookie"), "session");
  if (token !== null) {
    // SvelteKit answers an endpoint's own error itself (kit 3.2.0 src/runtime/server/endpoint.js), so a refusal is
    // thrown as its HttpError, with the catalog code as its message and the code's status: retryable, never a 500.
    const ended = await services()
      .accounts.signOut(token, locals.deadline)
      .catch((cause: unknown) => {
        if (cause instanceof AppError) return { ok: false as const, code: cause.code };
        throw cause;
      });
    if (typeof ended === "object") error(ERROR_CODES[ended.code].status, { message: ended.code });
    services().log.info("auth.logout_this_browser", {});
  }
  // The browser is told to clear this origin's storage too, once the session is gone (Clear-Site-Data "storage",
  // https://w3c.github.io/webappsec-clear-site-data/#grammardef-storage).
  setHeaders({ "clear-site-data": '"storage"' });
  dropCookie(cookies, "session");
  dropCookie(cookies, "nonce");
  dropCookie(cookies, "target");
  redirect(303, "/signed-out");
};
