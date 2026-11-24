import { definePolicy } from "../../lib/server/policy.ts";

// POST only, from our own form: SvelteKit's Origin check, so neither a link nor another site signs a member out.
export const policy = definePolicy({ group: "app", limit: "default", maxBody: 1024 });
