// GET and POST /login: the sign-in form, adapted from the old app's routes/login (Undefined6799/unset at 60228f5). A
// handle names the account; its server is where the member types their password. lib/server/sign-in does the work.
import { type Actions, redirect, type ServerLoad } from "@sveltejs/kit";
import { messageOf, readErrorParam } from "#lib/errors/index.ts";
import { startSignIn } from "#lib/server/sign-in/sign-in.ts";

export const load: ServerLoad = ({ url, locals }) => {
  const error = readErrorParam(url.searchParams);
  // A signed-in visitor has nothing to sign in to, unless a failed sign-in brought them back to read why.
  if (locals.member !== undefined && error === null) redirect(303, "/profile");
  return { error: error === null ? null : messageOf(error) };
};

export const actions: Actions = {
  // A signed-in browser goes to its profile, as on GET, and no authorization starts to replace its session.
  default: async ({ request, cookies, locals }) => {
    if (locals.member !== undefined) redirect(303, "/profile");
    return startSignIn(request, cookies, locals.deadline);
  },
};
