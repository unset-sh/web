import { definePolicy } from "../../../lib/server/policy.ts";

// A GET that changes state, bound to the browser by its nonce cookie, not by the Origin check; at the sign-in limit.
// Backend's redirect URI (WEB_ORIGIN/auth/callback).
export const policy = definePolicy({ group: "app", limit: "login" });
