import { definePolicy } from "../../lib/server/policy.ts";

// Anyone may read it; it reads no cookie.
export const policy = definePolicy({ group: "public", limit: "default" });
