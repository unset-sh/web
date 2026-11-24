// backend/accounts.ts: what each backend answer becomes for a route. A refusal backend documents is its catalog code;
// a session that is gone says so; anything outside the contract, or a backend that does not answer, is unavailable.
// The answers below are backend's own shapes (api/internal/openapi.yaml at source.json's commit).
import type { treaty } from "@elysia/eden";
import { describe, expect, test } from "vitest";
import { AppError } from "../../errors/index.ts";
import { createBackendAccounts } from "./accounts.ts";
import type { App } from "./app.d.ts";

const NONCE = `${"A".repeat(42)}Q`;
const TOKEN = "s".repeat(32);

/** True only for `any`: the copied type must never degrade to it, or Eden checks nothing. */
type IsAny<T> = 0 extends 1 & T ? true : false;
type Api = ReturnType<typeof treaty<App>>;
const typed: [
  IsAny<Api>,
  IsAny<Api["me"]["profile"]["get"]>,
  IsAny<Awaited<ReturnType<Api["me"]["profile"]["get"]>>["data"]>,
] = [false, false, false];

type Seen = { url: string; method: string; headers: Headers; body: unknown };

/** Accounts over a backend that answers `status` with `body`, recording what it was sent. */
function over(status: number, body?: unknown) {
  const seen: Seen[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    if (body === undefined) return new Response(null, { status });
    const problem = status >= 400;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": problem ? "application/problem+json" : "application/json" },
    });
  }) as typeof fetch;
  return { accounts: createBackendAccounts({ url: "http://backend.internal:3000", fetcher }), seen };
}

const problem = (status: number, code: string) => ({ type: "about:blank", title: "x", status, code });
const deadline = () => AbortSignal.timeout(5000);

describe("backend accounts", () => {
  test("the_api_type_is_not_any", () => {
    expect(typed).toEqual([false, false, false]);
  });

  test("start_sends_the_handle_and_nonce_and_returns_the_url", async () => {
    const { accounts, seen } = over(200, { url: "https://pds.example/oauth/authorize?request_uri=x" });
    expect(await accounts.startSignIn("alice.example.com", NONCE, deadline())).toEqual({
      ok: true,
      url: "https://pds.example/oauth/authorize?request_uri=x",
    });
    expect(seen[0]).toMatchObject({
      url: "http://backend.internal:3000/auth/sign-in/atproto",
      method: "POST",
      body: { handle: "alice.example.com", nonce: NONCE },
    });
    expect(seen[0]?.headers.has("authorization")).toBe(false);
  });

  test("start_maps_each_documented_refusal", async () => {
    for (const [status, code, expected] of [
      [400, "handle_unverified", "login.handle_unverified"],
      [400, "handle_not_found", "login.handle_not_found"],
      [400, "invalid_request", "login.handle_invalid"],
      [422, "invalid_request", "login.handle_invalid"],
      [503, "identity_unavailable", "login.identity_unavailable"],
      [503, "pds_unreachable", "login.pds_unreachable"],
      [502, "failed", "login.failed"],
    ] as const) {
      const { accounts } = over(status, problem(status, code));
      expect(await accounts.startSignIn("alice.example.com", NONCE, deadline())).toEqual({ ok: false, code: expected });
    }
  });

  test("complete_returns_the_token_and_maps_each_refusal", async () => {
    const { accounts, seen } = over(200, { sessionToken: TOKEN });
    expect(await accounts.completeSignIn("code=c&state=s&iss=x", NONCE, deadline())).toEqual({
      ok: true,
      token: TOKEN,
    });
    expect(seen[0]?.body).toEqual({ query: "code=c&state=s&iss=x", nonce: NONCE });
    for (const [status, code, expected] of [
      [400, "consent_denied", "login.consent_denied"],
      [400, "expired", "login.expired"],
      [400, "state_mismatch", "login.state_mismatch"],
      [400, "account_mismatch", "login.account_mismatch"],
      [400, "scope_missing", "login.scope_insufficient"],
      [503, "pds_unreachable", "login.pds_unreachable"],
      [502, "failed", "login.failed"],
    ] as const) {
      const refused = over(status, problem(status, code)).accounts;
      expect(await refused.completeSignIn("code=c", NONCE, deadline())).toEqual({ ok: false, code: expected });
    }
  });

  test("calls_for_a_member_send_the_token_as_a_bearer_and_no_cookie", async () => {
    const { accounts, seen } = over(200, { did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(await accounts.memberOf(TOKEN, deadline())).toEqual({ did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(seen[0]?.url).toBe("http://backend.internal:3000/me/session");
    expect(seen[0]?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(seen[0]?.headers.has("cookie")).toBe(false);
  });

  test("member_of_is_null_for_no_session_and_throws_when_backend_cannot_say", async () => {
    expect(await over(401, problem(401, "no_session")).accounts.memberOf(TOKEN, deadline())).toBeNull();
    await expect(over(500, problem(500, "failed")).accounts.memberOf(TOKEN, deadline())).rejects.toThrow(
      "service.unavailable",
    );
  });

  test("sign_out_tells_ended_from_failed", async () => {
    expect(await over(204).accounts.signOut(TOKEN, deadline())).toBe("ok");
    expect(await over(401, problem(401, "no_session")).accounts.signOut(TOKEN, deadline())).toBe("ended");
    expect(await over(503, problem(503, "failed")).accounts.signOut(TOKEN, deadline())).toEqual({
      ok: false,
      code: "logout.failed",
    });
  });

  test("profile_keeps_a_date_like_display_name_a_string", async () => {
    const profile = { did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", handle: "alice.example.com", displayName: "2026-11-24" };
    expect(await over(200, profile).accounts.profile(TOKEN, deadline())).toEqual({ ok: true, profile });
  });

  test("profile_refusals_say_when_the_session_is_gone", async () => {
    for (const [status, code, expected] of [
      [401, "no_session", { ok: false, code: "login.session_ended", sessionEnded: true }],
      [401, "session_ended", { ok: false, code: "login.session_ended", sessionEnded: true }],
      [403, "scope_missing", { ok: false, code: "login.scope_insufficient" }],
      [502, "failed", { ok: false, code: "profile.pds_unavailable" }],
      [503, "pds_unreachable", { ok: false, code: "profile.pds_unavailable" }],
    ] as const) {
      expect(await over(status, problem(status, code)).accounts.profile(TOKEN, deadline())).toEqual(expected);
    }
  });

  test("set_display_name_sends_a_patch_and_maps_each_refusal", async () => {
    const profile = { did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", displayName: "Alice" };
    const { accounts, seen } = over(200, profile);
    expect(await accounts.setDisplayName(TOKEN, "Alice", deadline())).toEqual({ ok: true, profile });
    expect(seen[0]).toMatchObject({ method: "PATCH", body: { displayName: "Alice" } });
    for (const [status, code, expected] of [
      [400, "name_invalid", "profile.invalid"],
      [400, "name_too_long", "profile.too_long"],
      [409, "conflict", "profile.conflict"],
      [502, "record_invalid", "profile.invalid"],
      [502, "failed", "profile.pds_unavailable"],
    ] as const) {
      const refused = over(status, problem(status, code)).accounts;
      expect(await refused.setDisplayName(TOKEN, "Alice", deadline())).toEqual({ ok: false, code: expected });
    }
  });

  test("an_answer_outside_the_contract_is_unavailable", async () => {
    for (const [status, body] of [
      [403, problem(403, "untrusted_origin")],
      [400, problem(400, "made_up")],
      [400, { code: "__proto__" }],
      [500, "not json"],
      [404, undefined],
    ] as const) {
      await expect(over(status, body).accounts.profile(TOKEN, deadline())).rejects.toThrow(AppError);
    }
  });

  test("a_backend_that_does_not_answer_is_unavailable_with_its_cause_unsent", async () => {
    const down = createBackendAccounts({
      url: "http://backend.internal:3000",
      fetcher: (async () => Promise.reject(new TypeError("connect ECONNREFUSED"))) as unknown as typeof fetch,
    });
    const refused = down.startSignIn("alice.example.com", NONCE, deadline());
    await expect(refused).rejects.toThrow(AppError);
    await expect(refused).rejects.toThrow("service.unavailable");
    await expect(down.memberOf(TOKEN, deadline())).rejects.toThrow("service.unavailable");
    expect(await down.signOut(TOKEN, deadline())).toEqual({ ok: false, code: "logout.failed" });
  });
});
