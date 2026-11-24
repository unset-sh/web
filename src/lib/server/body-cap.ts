// adapter-node's one body cap (BODY_SIZE_LIMIT, read when its handler loads; adapter-node 6.0.2 src/handler.js) must
// let the largest route's body through, or that route can never be used. Each route's own limit stays the gate's
// (hooks.server.ts requestProblem): it refuses a declared Content-Length above the route's maxBody and a body with
// none, and SvelteKit stops reading past the declared length (kit 3.2.0 src/exports/node/index.js get_raw_body), so no
// route reads more than its own maxBody. The largest route is named here by a literal import, as the old app's
// body-cap.ts does; body-cap.test.ts reads every policy.ts and fails if another route takes more.
import { policy as profile } from "../../routes/profile/policy.ts";

/** The largest maxBody of any route: the profile form's. */
export const BODY_CAP: number = profile.maxBody ?? 1;
