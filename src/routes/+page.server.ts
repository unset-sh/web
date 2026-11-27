import type { ServerLoad } from "@sveltejs/kit";
import { config } from "#lib/server/runtime.ts";
import { homeSeo } from "#lib/server/seo.ts";

export const load: ServerLoad = ({ locals }) => {
  const seo = homeSeo(config);
  locals.searchVisible = seo.indexable;
  return { seo };
};
