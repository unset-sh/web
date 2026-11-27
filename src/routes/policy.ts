import { definePolicy } from "../lib/server/policy.ts";

// Home: anyone may read it.
export const policy = definePolicy({ group: "app", limit: "default", search: true });
