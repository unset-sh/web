// What server.ts and the SvelteKit side share: settings and shutdown once per process, the log fields once per
// request. server.ts publishes it on globalThis before it imports the built handler, because importing the handler runs
// SvelteKit's init, which loads the hooks. This file has no side effects, so both sides can import it.
import type { AsyncLocalStorage } from "node:async_hooks";
import type { WebConfig } from "./config.ts";
import type { CloseHook } from "./http/index.ts";

/** Per request: the route the hook matched and the request id, for server.ts's log line. */
export type RequestNote = { route?: string; reqId: string };

/** What the SvelteKit side registers for shutdown: `draining` runs first (health answers 503), `close` after drain. */
export type Shutdown = { readonly draining: (() => void)[]; readonly close: CloseHook[] };

export type ProcessNote = {
  readonly config: WebConfig;
  /**
   * The build's stylesheet path (`/_app/immutable/assets/….css`), for the gate's refusal page; absent, it is plain.
   * server.ts sets it once, after the handler has loaded and before it listens.
   */
  stylesheet?: string | undefined;
  readonly requests: AsyncLocalStorage<RequestNote>;
  readonly shutdown: Shutdown;
};

export const NOTE_KEY = Symbol.for("unset.web");

export const publishedNote = (): ProcessNote | undefined =>
  (globalThis as Record<symbol, unknown>)[NOTE_KEY] as ProcessNote | undefined;
