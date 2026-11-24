// `/health`: 200 with the service and commit when ready, 503 otherwise (lib/server/http/health.ts). The container probe
// reads it, so server.ts skips the host check and the policy skips the rate limit.
import { services } from "#lib/server/compose.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => services().health.respond();
