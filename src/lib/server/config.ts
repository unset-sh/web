// The web process's settings (old app ADR 0054 decision 3): the shared config loader, so the cross-field rules and
// exit 78 hold here too. server.ts loads them with bootOrExit before it imports SvelteKit's handler and shares them
// through the process note (note.ts). A step adds the fields its routes need.
import { type Config, defineEntrypointConfig, oneOf, optionalSecretFile, origin, withRule } from "./config/index.ts";
import { httpKitConfig } from "./http/index.ts";

/**
 * Search and AI listing for the whole site (old app P1.21b). Off, the default, so a stack that leaves it unset is never
 * listed: every response says noindex.
 */
const searchConfig = {
  SEARCH_LISTING: oneOf(["on", "off"], { default: "off" }),
};

/**
 * Backend's internal API (org-0017): web's server calls it, the browser never does. Outside dev and test it is
 * https with mutual TLS (Alex, 2026-11-24, staging included): web shows the client certificate made by
 * unset-sh/deployment's scripts/internal-tls.sh and trusts only the CA that signed backend's. Each is a PEM file named
 * by `<KEY>_FILE`. An https origin takes all three; plain http takes none, and only in dev and test.
 */
const TLS_KEYS = ["BACKEND_TLS_CERT", "BACKEND_TLS_KEY", "BACKEND_TLS_CA"] as const;
const backendHolds = (config: Readonly<Record<string, unknown>>): boolean => {
  const set = TLS_KEYS.filter((key) => config[key] !== undefined).length;
  if (String(config.BACKEND_URL).startsWith("https:")) return set === TLS_KEYS.length;
  return set === 0 && (config.UNSET_ENV === "dev" || config.UNSET_ENV === "test");
};
const backendConfig = {
  BACKEND_URL: withRule(origin({ protocols: ["http:", "https:"] }), backendHolds),
  BACKEND_TLS_CERT: withRule(optionalSecretFile({ minBytes: 64 }), backendHolds),
  BACKEND_TLS_KEY: withRule(optionalSecretFile({ minBytes: 64 }), backendHolds),
  BACKEND_TLS_CA: withRule(optionalSecretFile({ minBytes: 64 }), backendHolds),
};

export const schema = defineEntrypointConfig({
  ...httpKitConfig,
  ...searchConfig,
  ...backendConfig,
});

export type WebConfig = Config<(typeof schema)["fields"]>;
