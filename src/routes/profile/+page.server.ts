// GET and POST /profile: the member's DID, handle and display name, and a form to change the name. Backend reads and
// writes the member's own record on their PDS; a session that has ended sends the member to sign in again.
import { type Actions, type Cookies, fail, redirect, type ServerLoad } from "@sveltejs/kit";
import { ERROR_CODES, messageOf, withErrorParam } from "#lib/errors/index.ts";
import type { Refusal } from "#lib/server/accounts/index.ts";
import { services } from "#lib/server/compose.ts";
import { dropCookie } from "#lib/server/sign-in/cookies.ts";
import type { Member } from "#lib/server/sign-in/session.ts";
import { single } from "#lib/server/sign-in/sign-in.ts";

/** The longest display name backend takes, in UTF-16 code units (its DisplayNameBody); it checks the rest. */
const MAX_NAME = 640;

/** The gate let only a member through (policy `session: "required"`); anything else is a wiring bug. */
function memberOf(locals: App.Locals): Member {
  if (locals.member === undefined) throw new Error("profile: reached without a session");
  return locals.member;
}

/** A gone session clears the cookie and goes to sign in; any other refusal is the text the page shows. */
function shown(refusal: Refusal, cookies: Cookies): string {
  if (refusal.sessionEnded) {
    dropCookie(cookies, "session");
    redirect(303, withErrorParam("/login", refusal.code));
  }
  return messageOf(refusal.code);
}

export const load: ServerLoad = async ({ locals, cookies }) => {
  const member = memberOf(locals);
  const read = await services().accounts.profile(member.token, locals.deadline);
  if (!read.ok) return { profile: null, error: shown(read, cookies) };
  return { profile: read.profile, error: null };
};

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    const member = memberOf(locals);
    const name = single(await request.formData(), "displayName");
    if (name === null || name.length > MAX_NAME) {
      return fail(400, { error: messageOf(name === null ? "profile.invalid" : "profile.too_long") });
    }
    const saved = await services().accounts.setDisplayName(member.token, name.trim(), locals.deadline);
    if (!saved.ok) return fail(ERROR_CODES[saved.code].status, { error: shown(saved, cookies) });
    return { saved: true };
  },
};
