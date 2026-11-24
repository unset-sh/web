// What web needs from the member's account: signing in and out, who a session belongs to, and the profile. Routes see
// this contract only; backend/accounts.ts is its one adapter, over backend's internal API. Every refusal is a catalog code a
// page may show, so no backend word reaches a route.
import type { ErrorCode } from "../../errors/index.ts";

/** A member's own profile, as the profile page shows it. `handle` only when it verifies both ways. */
export type Profile = { readonly did: string; readonly handle?: string; readonly displayName?: string };

/** A refusal: the code a page shows, and whether the session is gone (the cookie is cleared and the member signs in). */
export type Refusal = { readonly ok: false; readonly code: ErrorCode; readonly sessionEnded?: true };

export type Accounts = {
  /** The authorization server's URL for `handle`, bound to this browser's `nonce`. */
  startSignIn(handle: string, nonce: string, deadline: AbortSignal): Promise<{ ok: true; url: string } | Refusal>;
  /** The session token for the callback's `query`, when `nonce` is the one the sign-in started with. */
  completeSignIn(query: string, nonce: string, deadline: AbortSignal): Promise<{ ok: true; token: string } | Refusal>;
  /** Ends this session only; `ended` when there was none to end. */
  signOut(token: string, deadline: AbortSignal): Promise<"ok" | "ended" | Refusal>;
  /** The DID of a live session, or null for none. Throws an AppError when backend cannot answer. */
  memberOf(token: string, deadline: AbortSignal): Promise<{ did: string } | null>;
  profile(token: string, deadline: AbortSignal): Promise<{ ok: true; profile: Profile } | Refusal>;
  setDisplayName(
    token: string,
    displayName: string,
    deadline: AbortSignal,
  ): Promise<{ ok: true; profile: Profile } | Refusal>;
};
