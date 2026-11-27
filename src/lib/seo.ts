/** Public page data only. Authorization and publication checks happen before constructing this value. */
export type PublicPage = Readonly<{
  path: string;
  title: string;
  description: string;
  /** Explicit content-level search consent, independent of the site's launch setting. */
  searchVisible: boolean;
  image?: Readonly<{ path: string; alt: string; width: number; height: number }>;
  type?: "website" | "article" | "profile";
  structuredData?: Readonly<Record<string, unknown>>;
}>;

export type PageSeo = Readonly<{
  title: string;
  description: string;
  canonical: string;
  indexable: boolean;
  type: "website" | "article" | "profile";
  image: Readonly<{ url: string; alt: string; width: number; height: number }>;
  structuredData?: Readonly<Record<string, unknown>>;
}>;

/** JSON remains data even when visible user text contains a closing script tag. */
export function jsonLd(data: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
