// cookies.ts: a cookie counts only when it is sent once and is base64url; a value that is not one is never written; the
// continue page only sends a browser to https (or http on a dev stack) with no credentials in the link.
import { describe, expect, test } from "vitest";
import { cookieValue, decodeTarget, encodeTarget, NONCE, newNonce, putCookie, safeTarget } from "./cookies.ts";

describe("sign-in cookies", () => {
  test("a_cookie_sent_twice_or_malformed_counts_as_none", () => {
    expect(cookieValue("a=1; __Host-sid=abc_-1", "session")).toBe("abc_-1");
    expect(cookieValue("__Host-sid=abc; __Host-sid=def", "session")).toBeNull();
    expect(cookieValue("__Host-sid=a%20b", "session")).toBeNull();
    expect(cookieValue("__Host-sid=", "session")).toBeNull();
    expect(cookieValue("x__Host-sid=abc", "session")).toBeNull();
    expect(cookieValue(null, "nonce")).toBeNull();
  });

  test("only_base64url_is_written", () => {
    const written: string[] = [];
    const cookies = { set: (name: string, value: string) => written.push(`${name}=${value}`) } as never;
    putCookie(cookies, "nonce", newNonce());
    expect(() => putCookie(cookies, "session", "a;b")).toThrow(RangeError);
    expect(written).toHaveLength(1);
  });

  test("a_nonce_is_32_random_bytes", () => {
    const [a, b] = [newNonce(), newNonce()];
    expect(a).toMatch(NONCE);
    expect(a).not.toBe(b);
  });

  test("the_target_round_trips_and_only_a_safe_link_is_kept", () => {
    const url = "https://pds.example/oauth/authorize?request_uri=urn%3Ax";
    expect(decodeTarget(encodeTarget(url))).toBe(url);
    expect(safeTarget(url, false)).toBe(url);
    expect(safeTarget("http://pds.example/a", false)).toBeNull();
    expect(safeTarget("http://pds.example/a", true)).toBe("http://pds.example/a");
    expect(safeTarget("https://user:pass@pds.example/", true)).toBeNull();
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative", "not a url"]) {
      expect(safeTarget(bad, true)).toBeNull();
    }
  });
});
