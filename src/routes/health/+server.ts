// `/health`: the container probe reads it. 200 with no body once the server answers; the readiness of what web
// depends on joins it with the backend adapter.
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
