// Who is asking: the gate's session read, adapted from the old app's session.ts (Undefined6799/unset at 60228f5). The
// session cookie holds backend's token, and backend says whose it is on every read; a token it no longer knows is
// cleared here.
import type { Cookies } from "@sveltejs/kit";
import { services } from "../compose.ts";
import { cookieValue, dropCookie } from "./cookies.ts";

/** A signed-in member: their DID, and the token every call for them carries. */
export type Member = { readonly did: string; readonly token: string };

/** The member this request's session cookie belongs to, or undefined; throws when backend cannot say. */
export async function memberOf(request: Request, cookies: Cookies, deadline: AbortSignal): Promise<Member | undefined> {
  const token = cookieValue(request.headers.get("cookie"), "session");
  if (token === null) return undefined;
  const found = await services().accounts.memberOf(token, deadline);
  if (found === null) {
    dropCookie(cookies, "session");
    return undefined;
  }
  return { did: found.did, token };
}
