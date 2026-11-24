import { definePolicy } from "../../../lib/server/policy.ts";

// Reads this browser's own Strict cookie, so it is private and never stored.
export const policy = definePolicy({ group: "app", limit: "default" });
