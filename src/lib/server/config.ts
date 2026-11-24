// The web process's settings (old app ADR 0054 decision 3): the shared config loader, so the cross-field rules and
// exit 78 hold here too. server.ts loads them with bootOrExit before it imports SvelteKit's handler and shares them
// through the process note (note.ts). A step adds the fields its routes need.
import { type Config, defineEntrypointConfig, oneOf, origin } from "./config/index.ts";
import { httpKitConfig } from "./http/index.ts";

/**
 * Search and AI listing for the whole site (old app P1.21b). Off, the default, so a stack that leaves it unset is never
 * listed: every response says noindex.
 */
const searchConfig = {
  SEARCH_LISTING: oneOf(["on", "off"], { default: "off" }),
};

/**
 * Backend's internal API (org-0017): web's server calls it, the browser never does. It is reached on deployment's
 * private network, where backend listens without TLS, so plain http is accepted in every environment; nothing else
 * may reach that port. The member's session token travels on it as a bearer header.
 */
const backendConfig = {
  BACKEND_URL: origin({ protocols: ["http:", "https:"] }),
};

export const schema = defineEntrypointConfig({
  ...httpKitConfig,
  ...searchConfig,
  ...backendConfig,
});

export type WebConfig = Config<(typeof schema)["fields"]>;
