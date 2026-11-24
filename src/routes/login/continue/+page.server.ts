// GET /login/continue, from the old app's page of that name (Undefined6799/unset at 60228f5): Chromium applies the
// CSP's form-action to a form's redirects, so POST /login answers 303 here and this page moves on with a meta refresh,
// a new navigation. The target is the one this browser's own POST stored, checked again.
import type { ServerLoad } from "@sveltejs/kit";
import { back, storedTarget } from "#lib/server/sign-in/sign-in.ts";

export const load: ServerLoad = ({ request }) => {
  const target = storedTarget(request);
  if (target === null) back("login.expired");
  return { target, host: new URL(target).host };
};
