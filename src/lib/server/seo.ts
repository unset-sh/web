import type { PageSeo, PublicPage } from "../seo.ts";

type SearchConfig = Readonly<{ PUBLIC_ORIGIN: string; SEARCH_LISTING: "on" | "off" }>;
export const DEFAULT_SHARE_IMAGE_PATH = "/sharing/unset.png";

/** Fixed public routes that actually exist. Dynamic content must supply its own authorized public records. */
export const HOME: PublicPage = Object.freeze({
  path: "/",
  title: "unset — Your profile, projects and links",
  description:
    "Bring your introduction, projects and links together in a profile built on the AT Protocol. Your corner of the internet, with unset.",
  searchVisible: true,
});
export const PUBLIC_PAGES: readonly PublicPage[] = [HOME];

/** Local canonical paths only: never request hosts, tracking queries, fragments or external URLs. */
function absolutePath(origin: string, path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\?#\s]/u.test(path) ||
    [...path].some((char) => char.charCodeAt(0) < 32)
  ) {
    throw new Error("SEO needs a canonical local path");
  }
  const base = new URL(origin);
  if (
    !/^https?:$/.test(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error("SEO needs a configured public origin");
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.pathname !== path) throw new Error("SEO needs a normalized local path");
  return url.href;
}

export function isSearchVisible(page: PublicPage, config: SearchConfig): boolean {
  return config.SEARCH_LISTING === "on" && page.searchVisible === true;
}

/** A caller supplies a specialized, publicly served image; absent or failed renders use the brand fallback. */
export function publicPageSeo(page: PublicPage, config: SearchConfig): PageSeo {
  if (!page.title.trim() || !page.description.trim()) throw new Error("SEO needs a title and description");
  const image = page.image ?? {
    path: DEFAULT_SHARE_IMAGE_PATH,
    alt: "unset.sh with the Unset mark",
    width: 1200,
    height: 630,
  };
  if (
    !image.alt.trim() ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new Error("SEO needs an accessible image with dimensions");
  }
  return {
    title: page.title.trim(),
    description: page.description.trim(),
    canonical: absolutePath(config.PUBLIC_ORIGIN, page.path),
    indexable: isSearchVisible(page, config),
    type: page.type ?? "website",
    image: {
      url: absolutePath(config.PUBLIC_ORIGIN, image.path),
      alt: image.alt,
      width: image.width,
      height: image.height,
    },
    ...(page.structuredData ? { structuredData: page.structuredData } : {}),
  };
}

export function homeSeo(config: SearchConfig): PageSeo {
  const seo = publicPageSeo(HOME, config);
  return {
    ...seo,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${seo.canonical}#website`,
      name: "unset",
      alternateName: "unset.sh",
      url: seo.canonical,
      description: seo.description,
      inLanguage: "en",
    },
  };
}

const escapeXml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export function sitemap(config: SearchConfig): string {
  const entries = PUBLIC_PAGES.filter((page) => isSearchVisible(page, config))
    .map((page) => `<url><loc>${escapeXml(absolutePath(config.PUBLIC_ORIGIN, page.path))}</loc></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>\n`;
}

export function robots(config: SearchConfig): string {
  // Let crawlers read noindex on excluded pages once launched. Authentication, never robots, protects private data.
  return config.SEARCH_LISTING === "on"
    ? `User-agent: *\nAllow: /\n\nSitemap: ${absolutePath(config.PUBLIC_ORIGIN, "/sitemap.xml")}\n`
    : "User-agent: *\nDisallow: /\n";
}
