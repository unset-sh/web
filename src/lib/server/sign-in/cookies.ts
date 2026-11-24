// The browser's cookies for signing in and the session, adapted from the old app (Undefined6799/unset at 60228f5,
// interfaces/web/src/lib/server/session.ts and sign-in-state.ts). Each is host-only by its `__Host-` prefix (Secure,
// Path=/, no Domain; RFC 6265bis §4.1.3.2) and HttpOnly. They are written through SvelteKit's `cookies` API (kit 3.2.0
// src/runtime/server/cookie.js) and read from the raw header, because `cookies.get` silently takes the first of two.
import { randomBytes } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** What binds a sign-in to this browser: 32 random bytes, base64url, as backend's sign-in routes take it. */
export const NONCE = /^[A-Za-z0-9_-]{43}$/;

const COOKIES = {
  /**
   * The member's session token, as backend issued it at the callback. Lax, so following a link here from another
   * site arrives signed in. It lives at most 30 days; backend's own expiry decides sooner, and the gate then clears it.
   */
  session: { name: "__Host-sid", sameSite: "lax", maxAge: 2_592_000 },
  /** The sign-in's nonce. Lax, so the authorization server's redirect back (a top-level GET from another site) has it. */
  nonce: { name: "__Host-oauth_nonce", sameSite: "lax", maxAge: 600 },
  /** The authorization URL waiting for /login/continue: Strict, because only our own 303 leads there. */
  target: { name: "__Host-login_target", sameSite: "strict", maxAge: 120 },
} as const;

export type BrowserCookie = keyof typeof COOKIES;

const attributes = (cookie: BrowserCookie) =>
  ({ path: "/", secure: true, httpOnly: true, sameSite: COOKIES[cookie].sameSite }) as const;

/** Sets `cookie` to `value`, which must be base64url, for its Max-Age. */
export function putCookie(cookies: Cookies, cookie: BrowserCookie, value: string): void {
  if (!BASE64URL.test(value)) throw new RangeError(`${COOKIES[cookie].name}: value is not base64url`);
  cookies.set(COOKIES[cookie].name, value, { ...attributes(cookie), maxAge: COOKIES[cookie].maxAge });
}

/** Removes `cookie` (Max-Age=0, same attributes). */
export function dropCookie(cookies: Cookies, cookie: BrowserCookie): void {
  cookies.delete(COOKIES[cookie].name, attributes(cookie));
}

/**
 * The value of `cookie` when exactly one is sent and it is base64url, else null: two mean a confused or planted jar,
 * and neither counts.
 */
export function cookieValue(header: string | null, cookie: BrowserCookie): string | null {
  const name = COOKIES[cookie].name;
  const values = (header ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith(`${name}=`))
    .map((pair) => pair.slice(name.length + 1));
  const [value] = values;
  return values.length === 1 && value !== undefined && BASE64URL.test(value) ? value : null;
}

/** A new sign-in nonce. */
export const newNonce = (): string => randomBytes(32).toString("base64url");

export const encodeTarget = (target: string): string => Buffer.from(target).toString("base64url");
export const decodeTarget = (encoded: string): string => Buffer.from(encoded, "base64url").toString("utf8");

/**
 * `text` as a link this site may send a browser to, or null: https, or plain http when `allowHttp` (a dev stack, whose
 * PDS may have no TLS), with no user or password in it.
 */
export function safeTarget(text: string, allowHttp: boolean): string | null {
  if (!URL.canParse(text)) return null;
  const url = new URL(text);
  const https = url.protocol === "https:" || (allowHttp && url.protocol === "http:");
  return https && url.username === "" && url.password === "" ? url.href : null;
}
