// The web server's HTTP kit, from the old app's shared/http: the config fragment, the security headers, health, the
// rate-limit primitive, the client address behind a trusted proxy and the drain.

export type { ClientIp } from "./clientIp.ts";
export { type HttpKitConfig, hostAllowed, httpKitConfig } from "./config.ts";
export { type HeaderSet, SECURITY_HEADERS } from "./headers.ts";
export { createHealth, type HealthState, type Readiness } from "./health.ts";
export { definePolicies, type Policy, type PolicyEntry, type PolicyName, type PolicyTable } from "./limits/policy.ts";
export { createRateLimiter, type RateLimiter } from "./limits/rateLimit.ts";
export { type CloseHook, drain, exitOnSignals } from "./shutdown.ts";
export { createClientIpResolver, type ProxySettings } from "./trustedProxy.ts";
