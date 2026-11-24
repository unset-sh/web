// The web process's composition root, cut down from the old app's compose.ts to what this step serves: the logger, the
// rate limiter, health and the member's account over backend. A later step adds its own service here, with its
// readiness check and its shutdown step. Built once by the `init` hook (hooks.server.ts), before server.ts listens.
import type { Accounts } from "./accounts/index.ts";
import { createBackendAccounts } from "./backend/accounts.ts";
import { createHealth, createRateLimiter, type RateLimiter } from "./http/index.ts";
import { policiesFor } from "./limits.ts";
import { createLogger, type Logger } from "./log/index.ts";
import { config, shutdown } from "./runtime.ts";

/** How often idle rate-limit buckets are swept. */
const SWEEP_MS = 10_000;

export type Services = {
  readonly log: Logger;
  readonly limiter: RateLimiter;
  readonly health: ReturnType<typeof createHealth>;
  readonly accounts: Accounts;
};

function build(): Services {
  const log: Logger = createLogger({ service: "web", commit: config.UNSET_COMMIT, env: config.UNSET_ENV });
  const limiter: RateLimiter = createRateLimiter(policiesFor(config.TRUSTED_PROXY_MODE), {
    maxKeys: config.RATE_LIMIT_MAX_KEYS,
    onError: () => log.error("ratelimit.error", {}),
  });
  const sweeper = setInterval(() => limiter.sweep(), SWEEP_MS);
  sweeper.unref();
  // Nothing web depends on is checked yet: ready once it serves, 503 once it drains.
  const health = createHealth({
    service: config.UNSET_SERVICE,
    commit: config.UNSET_COMMIT,
    checks: [],
    now: () => performance.now(),
  });
  health.setState("running");
  shutdown.draining.push(() => health.setState("draining"));
  shutdown.close.push(async () => clearInterval(sweeper));
  // Backend's own readiness is not web's: a page that needs it answers service.unavailable while it is down.
  const accounts = createBackendAccounts({ url: config.BACKEND_URL });
  return { log, limiter, health, accounts };
}

let built: Services | undefined;

/** Builds every service once; the `init` hook calls it, so a failure stops the process before it listens. */
export function startServices(): void {
  built ??= build();
}

/** The built services. Only after `startServices`; a call before it is a wiring bug, refused loudly. */
export const services = (): Services => {
  if (built === undefined) throw new Error("services: used before the init hook built them");
  return built;
};
