import { config } from "#lib/server/runtime.ts";
import { robots } from "#lib/server/seo.ts";

export const GET = () =>
  new Response(robots(config), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" },
  });
