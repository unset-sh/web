// The web process's settings (old app ADR 0054 decision 3): the shared config loader, so the cross-field rules and
// exit 78 hold here too. server.ts loads them with bootOrExit before it imports SvelteKit's handler and shares them
// through the process note (note.ts). A step adds the fields its routes need.
import { type Config, defineEntrypointConfig, oneOf } from "./config/index.ts";
import { httpKitConfig } from "./http/index.ts";

/**
 * Search and AI listing for the whole site (old app P1.21b). Off, the default, so a stack that leaves it unset is never
 * listed: every response says noindex.
 */
const searchConfig = {
  SEARCH_LISTING: oneOf(["on", "off"], { default: "off" }),
};

export const schema = defineEntrypointConfig({
  ...httpKitConfig,
  ...searchConfig,
});

export type WebConfig = Config<(typeof schema)["fields"]>;
