import { definePolicy } from "../../lib/server/policy.ts";

// The member's own profile. A save writes to their PDS, so it counts against the profile limit, per member too.
export const policy = definePolicy({
  group: "app",
  limit: "default",
  writeLimit: "profile",
  maxBody: 4096,
  session: "required",
});
