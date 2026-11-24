import { definePolicy } from "../../lib/server/policy.ts";

// The sign-in form: reads at the page limit, the POST at the sign-in limit. It reads the session, so a member who is
// already signed in goes to their profile.
export const policy = definePolicy({
  group: "app",
  limit: "default",
  writeLimit: "login",
  maxBody: 2048,
  session: "optional",
});
