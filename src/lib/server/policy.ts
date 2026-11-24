// What each route needs from the request gate (hooks.server.ts). Every route folder holds a policy.ts beside its
// +page/+server file: `export const policy = definePolicy({ ... })`. route-table.ts gathers them by route id, so a
// page and its rules live together and no shared table needs editing. This file imports nothing that imports it.
import type { PolicyName } from "./limits.ts";

/**
 * The CSP group of a response (csp.ts). `app` pages run SvelteKit's client under its script policy; a `public` page
 * runs no script (`csr = false`); `static` is never a page.
 */
export type PageGroup = "app" | "public" | "static";

export type RoutePolicy = Readonly<{
  group: PageGroup;
  /** The rate-limit policy (a key of limits.ts `policies`). */
  limit: PolicyName;
  /** The policy a POST counts against instead of `limit`, address and member buckets both (a page whose writes cost
   * more than its reads). */
  writeLimit?: PolicyName;
  /** Largest POST body accepted, in bytes (Content-Length). Absent means the route takes no body. */
  maxBody?: number;
  /** This route's own deadline; otherwise REQUEST_DEADLINE_MS. */
  deadlineMs?: number;
  /** /health only: no host check and no rate limit, so the container probe always reaches it. */
  probe?: true;
}>;

/** Typed helper for a route's policy.ts: `export const policy = definePolicy({ ... })`. */
export const definePolicy = (policy: RoutePolicy): RoutePolicy => policy;
