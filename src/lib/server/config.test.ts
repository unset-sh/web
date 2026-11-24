// config.ts: backend over https takes web's three TLS files; plain http takes none, and only in dev and test (Alex,
// 2026-11-24: mutual TLS between web and backend, staging included; staging runs as prod).
import { describe, expect, test } from "vitest";
import { schema } from "./config.ts";

const TLS = ["BACKEND_TLS_CERT", "BACKEND_TLS_KEY", "BACKEND_TLS_CA"] as const;
const KEYS = ["BACKEND_URL", ...TLS];
const all = Object.fromEntries(TLS.map((key) => [key, { reveal: () => "pem" }]));

/** The backend keys whose rule fails for `config`. */
const refused = (config: Record<string, unknown>) =>
  schema.rules.filter((rule) => KEYS.includes(rule.key) && !rule.holds(config as never)).map((rule) => rule.key);

describe("backend settings", () => {
  test("prod_needs_https_with_all_three_files", () => {
    expect(refused({ UNSET_ENV: "prod", BACKEND_URL: "http://backend:8080" })).toEqual(KEYS);
    expect(refused({ UNSET_ENV: "prod", BACKEND_URL: "https://backend.internal" })).toEqual(KEYS);
    expect(refused({ UNSET_ENV: "prod", BACKEND_URL: "https://backend.internal", ...all })).toEqual([]);
  });

  test("dev_and_test_may_use_plain_http_without_files", () => {
    for (const env of ["dev", "test"]) {
      expect(refused({ UNSET_ENV: env, BACKEND_URL: "http://127.0.0.1:8080" })).toEqual([]);
      expect(refused({ UNSET_ENV: env, BACKEND_URL: "http://127.0.0.1:8080", ...all })).toEqual(KEYS);
    }
  });

  test("a_partial_set_is_refused", () => {
    const partial = { BACKEND_URL: "https://backend.internal", BACKEND_TLS_CERT: all.BACKEND_TLS_CERT };
    expect(refused({ UNSET_ENV: "test", ...partial })).toEqual(KEYS);
  });
});
