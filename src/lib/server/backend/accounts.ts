// The accounts contract (../accounts) over backend's internal API, through Eden Treaty on backend's published type
// (app.d.ts, pinned in source.json; org-0017). Server-side only: the session token travels as a bearer header, never a
// cookie, so backend's Origin rule for cookies does not apply (org-0015). Backend's problem codes become catalog codes
// here, and a backend that cannot be reached or answers out of contract is `service.unavailable`.
// Eden Treaty 1.4.10 (node_modules/@elysia/eden/dist/chunk-TTKI5TQ7.mjs, treaty2): every call answers `{ data, error }`,
// with `error.status` and `error.value` typed per status. A fetch that fails (backend down, the deadline) does not
// reject: it answers status 503 with the thrown error as its value, which carries no code, so it is unavailable here.
import { treaty } from "@elysia/eden";
import { AppError, type ErrorCode } from "../../errors/index.ts";
import type { Accounts, Refusal } from "../accounts/index.ts";
import type { App } from "./app.d.ts";

const refusal = (code: ErrorCode, sessionEnded = false): Refusal =>
  sessionEnded ? { ok: false, code, sessionEnded: true } : { ok: false, code };

/** Backend's codes for each operation, as the catalog's. A code missing here is out of contract: unavailable. */
const START: Record<string, ErrorCode> = {
  handle_unverified: "login.handle_unverified",
  handle_not_found: "login.handle_not_found",
  identity_unavailable: "login.identity_unavailable",
  pds_unreachable: "login.pds_unreachable",
  failed: "login.failed",
  invalid_request: "login.handle_invalid",
};
const COMPLETE: Record<string, ErrorCode> = {
  consent_denied: "login.consent_denied",
  expired: "login.expired",
  state_mismatch: "login.state_mismatch",
  account_mismatch: "login.account_mismatch",
  pds_unreachable: "login.pds_unreachable",
  failed: "login.failed",
  scope_missing: "login.scope_insufficient",
  invalid_request: "login.expired",
};
const PROFILE: Record<string, ErrorCode> = {
  session_ended: "login.session_ended",
  no_session: "login.session_ended",
  scope_missing: "login.scope_insufficient",
  pds_unreachable: "profile.pds_unavailable",
  failed: "profile.pds_unavailable",
  name_invalid: "profile.invalid",
  name_too_long: "profile.too_long",
  invalid_request: "profile.invalid",
  conflict: "profile.conflict",
  record_invalid: "profile.invalid",
};
/** The codes after which the session cannot be used again: the cookie goes and the member signs in. */
const ENDED = new Set(["no_session", "session_ended"]);

/** The problem code of a refusal, or null when the body is not one of backend's problem documents. */
function codeOf(error: { value: unknown }): string | null {
  const value = error.value as { code?: unknown } | null;
  return typeof value?.code === "string" ? value.code : null;
}

/** A refusal for `error` from `table`, or unavailable for anything outside it. */
function mapped(error: { value: unknown }, table: Record<string, ErrorCode>): Refusal {
  const code = codeOf(error);
  const known = code !== null && Object.hasOwn(table, code) ? table[code] : undefined;
  if (known === undefined) throw new AppError("service.unavailable");
  return refusal(known, code !== null && ENDED.has(code));
}

/** Runs one call; anything that throws on the way (a body Eden cannot read) is `service.unavailable`, cause kept. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError("service.unavailable", { cause });
  }
}

/** PEM text for mutual TLS with backend: web's client certificate and key, and the CA that signed backend's. */
export type BackendTls = { readonly cert: string; readonly key: string; readonly ca: string };

/**
 * `fetch` that shows web's certificate and trusts only `tls.ca` for backend's (Bun 1.4.4 `fetch` option `tls`,
 * bun-types globals.d.ts `BunFetchRequestInitTLS`: `ca` replaces the public CAs, and the host name is checked
 * against backend's certificate as usual).
 */
export function mutualTlsFetch(tls: BackendTls, base: typeof fetch = fetch): typeof fetch {
  const withTls = (input: RequestInfo | URL, init?: BunFetchRequestInit) =>
    base(input, { ...init, tls: { cert: tls.cert, key: tls.key, ca: tls.ca } });
  return Object.assign(withTls, { preconnect: base.preconnect });
}

export function createBackendAccounts(options: {
  readonly url: string;
  readonly tls?: BackendTls;
  readonly fetcher?: typeof fetch;
}): Accounts {
  const base = options.fetcher ?? fetch;
  const fetcher = options.tls === undefined ? base : mutualTlsFetch(options.tls, base);
  const api = treaty<App>(options.url, {
    fetcher,
    // Eden turns any string that looks like a date into a Date, a display name included, unless told not to.
    parseDate: false,
  });
  const as = (token: string, deadline: AbortSignal) => ({
    headers: { authorization: `Bearer ${token}` },
    fetch: { signal: deadline },
  });

  return {
    startSignIn: (handle, nonce, deadline) =>
      call(async () => {
        const result = await api.auth["sign-in"].atproto.post({ handle, nonce }, { fetch: { signal: deadline } });
        if (result.error) return mapped(result.error, START);
        return { ok: true, url: result.data.url };
      }),

    completeSignIn: (query, nonce, deadline) =>
      call(async () => {
        const result = await api.auth["sign-in"].atproto.callback.post(
          { query, nonce },
          { fetch: { signal: deadline } },
        );
        if (result.error) return mapped(result.error, COMPLETE);
        return { ok: true, token: result.data.sessionToken };
      }),

    signOut: (token, deadline) =>
      call(async () => {
        const result = await api.auth["sign-out"].post(undefined, as(token, deadline));
        if (!result.error) return "ok";
        if (result.error.status === 401) return "ended";
        // Backend's own 503 (the grant could not be ended) and a backend that did not answer: both may be tried again.
        if (result.error.status === 503) return refusal("logout.failed");
        throw new AppError("service.unavailable");
      }),

    memberOf: (token, deadline) =>
      call(async () => {
        const result = await api.me.session.get(as(token, deadline));
        if (!result.error) return { did: result.data.did };
        if (result.error.status === 401) return null;
        throw new AppError("service.unavailable");
      }),

    profile: (token, deadline) =>
      call(async () => {
        const result = await api.me.profile.get(as(token, deadline));
        if (result.error) return mapped(result.error, PROFILE);
        return { ok: true, profile: result.data };
      }),

    setDisplayName: (token, displayName, deadline) =>
      call(async () => {
        const result = await api.me.profile.patch({ displayName }, as(token, deadline));
        if (result.error) return mapped(result.error, PROFILE);
        return { ok: true, profile: result.data };
      }),
  };
}
