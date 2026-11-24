// The web process's rate-limit policies, from the old app's web limits (its P1.06p and ADR 0042). Each entry is a
// token bucket: `capacity` at once, refilled at `refillPerSec`. A page names one of these in its policy.ts; a page that
// needs a new policy adds it here.
import { definePolicies, type PolicyTable } from "./http/index.ts";

/**
 * The site-wide page ceiling (ADR 0042; sized for thousands of members by P1.21j, Proposed ADR 0071, from 3000 at once
 * and 50 a second): 30000 at once, 500 a second. That is 1000 members each clicking every 2 seconds, or 5000 at a page
 * every 10 seconds. It guards the process and the PDS against a flood from many addresses; the edge limits each one.
 */
const SITE_CEILING = { capacity: 30_000, refillPerSec: 500, scope: "global" } as const;

export const policies = definePolicies({
  default: [{ capacity: 60, refillPerSec: 300 / 60, scope: "ip" }, SITE_CEILING],
  // A profile save writes to the member's PDS: the page limits, and 30 a minute for one member whatever their address.
  profile: [
    { capacity: 60, refillPerSec: 300 / 60, scope: "ip" },
    SITE_CEILING,
    { capacity: 30, refillPerSec: 30 / 60, scope: "did" },
  ],
  login: [{ capacity: 10, refillPerSec: 10 / 60, scope: "ip" }],
});

export type PolicyName = keyof typeof policies & string;

/**
 * The site-wide ceiling on sign-in steps when the edge is the per-client layer (ADR 0042): 600 at once, 10 a second
 * since P1.21j (was 120 and 2), so about 300 sign-ins a minute, each POST /login and its callback.
 */
const SIGN_IN_CEILING = { capacity: 600, refillPerSec: 10, scope: "global" } as const;

/**
 * The table without its per-address entries, for socket mode (ADR 0042): behind the edge every request has the edge's
 * address, so an `ip` entry would be one bucket for everyone. `login` gets the sign-in ceiling; per-DID entries stay.
 */
function withoutAddressEntries(table: PolicyTable): PolicyTable {
  const kept = Object.entries(table).map(([name, policy]) => {
    const entries = policy.filter((entry) => entry.scope !== "ip");
    return [name, name === "login" ? [...entries, SIGN_IN_CEILING] : entries] as const;
  });
  return definePolicies(Object.fromEntries(kept));
}

/** Per address in `header` mode (the edge names the client); ceilings only in `socket` mode. */
export const policiesFor = (mode: "header" | "socket"): PolicyTable =>
  mode === "socket" ? withoutAddressEntries(policies) : policies;
