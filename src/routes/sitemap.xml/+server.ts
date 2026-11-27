import { config } from "#lib/server/runtime.ts";
import { sitemap } from "#lib/server/seo.ts";

export const GET = () =>
  new Response(sitemap(config), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-cache" },
  });
