// The one error-code catalog (from the old app's shared/errors). Only these codes ever reach a URL, a response or a log.

type Status = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 421 | 429 | 500 | 503;

/**
 * Every error code, `area.reason` in lowercase ASCII, with its HTTP status and whether a page may show it. A
 * non-public code never appears in a URL or a response body. Later steps add their codes here.
 */
export const ERROR_CODES = {
  "http.bad_request": { status: 400, public: true },
  "http.not_found": { status: 404, public: true },
  "http.method_not_allowed": { status: 405, public: true },
  "http.unsupported_media_type": { status: 415, public: true },
  "http.payload_too_large": { status: 413, public: true },
  "http.misdirected": { status: 421, public: true },
  "http.rate_limited": { status: 429, public: true },
  "http.deadline": { status: 503, public: true },
  "csrf.denied": { status: 403, public: true },
  "internal.error": { status: 500, public: true },
  "service.unavailable": { status: 503, public: true },
  "config.invalid": { status: 500, public: false },
  // Sign-in, sign-out and the profile (the old app's codes, shared/errors/catalog.ts at 60228f5).
  "login.handle_invalid": { status: 400, public: true },
  "login.handle_not_found": { status: 404, public: true },
  "login.handle_unverified": { status: 400, public: true },
  "login.identity_unavailable": { status: 503, public: true },
  "login.pds_unreachable": { status: 503, public: true },
  "login.failed": { status: 500, public: true },
  "login.expired": { status: 400, public: true },
  "login.state_mismatch": { status: 400, public: true },
  "login.consent_denied": { status: 403, public: true },
  "login.scope_insufficient": { status: 403, public: true },
  "login.account_mismatch": { status: 403, public: true },
  "login.session_ended": { status: 401, public: true },
  "logout.failed": { status: 503, public: true },
  "profile.invalid": { status: 400, public: true },
  "profile.too_long": { status: 400, public: true },
  "profile.conflict": { status: 409, public: true },
  "profile.pds_unavailable": { status: 503, public: true },
} as const satisfies Record<string, { status: Status; public: boolean }>;

export type ErrorCode = keyof typeof ERROR_CODES;

/** True when `value` is a catalog code (own key only, so `__proto__` and friends are not codes). */
export const isErrorCode = (value: string): value is ErrorCode => Object.hasOwn(ERROR_CODES, value);
