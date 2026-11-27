import { describe, expect, test } from "vitest";
import { jsonLd } from "../seo.ts";
import { HOME, homeSeo, publicPageSeo, robots, sitemap } from "./seo.ts";

const off = { PUBLIC_ORIGIN: "https://unset.test", SEARCH_LISTING: "off" } as const;
const on = { ...off, SEARCH_LISTING: "on" } as const;

describe("public page SEO", () => {
  test("launch_and_content_both_opt_in", () => {
    expect(publicPageSeo(HOME, off).indexable).toBe(false);
    expect(publicPageSeo(HOME, on).indexable).toBe(true);
    expect(publicPageSeo({ ...HOME, searchVisible: false }, on).indexable).toBe(false);
    expect(sitemap(off)).not.toContain("<url>");
    expect(sitemap(on)).toContain("<loc>https://unset.test/</loc>");
    expect(robots(off)).toContain("Disallow: /");
    expect(robots(on)).toContain("Sitemap: https://unset.test/sitemap.xml");
  });

  test("canonical_paths_do_not_accept_external_or_ambiguous_urls", () => {
    for (const path of [
      "//evil.test/",
      "/\\evil.test/",
      "/?theme=dark",
      "/#about",
      "/../login",
      "https://evil.test/",
      "/a\n",
    ]) {
      expect(() => publicPageSeo({ ...HOME, path }, on), path).toThrow();
    }
    for (const origin of ["javascript:alert(1)", "https://user:pass@unset.test", "https://unset.test/a"]) {
      expect(() => homeSeo({ ...on, PUBLIC_ORIGIN: origin })).toThrow();
    }
    expect(homeSeo(on).canonical).toBe("https://unset.test/");
  });

  test("default_card_is_used_unless_a_public_specialized_image_is_supplied", () => {
    expect(homeSeo(on).image).toEqual({
      url: "https://unset.test/sharing/unset.png",
      alt: "unset.sh with the Unset mark",
      width: 1200,
      height: 630,
    });
    const image = { path: "/sharing/public-profile.png", alt: "Example profile", width: 1200, height: 630 };
    expect(publicPageSeo({ ...HOME, image }, on).image.url).toBe("https://unset.test/sharing/public-profile.png");
    expect(() => publicPageSeo({ ...HOME, image: { ...image, width: 0 } }, on)).toThrow();
    expect(() => publicPageSeo({ ...HOME, title: " " }, on)).toThrow();
  });

  test("structured_data_remains_data_with_untrusted_visible_text", () => {
    const text = '</script><script>alert("x")</script>&\u2028\u2029';
    const serialized = jsonLd({ headline: text });
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual({ headline: text });
    expect(homeSeo(on).structuredData?.["@type"]).toBe("WebSite");
    expect(homeSeo(on).structuredData).not.toHaveProperty("potentialAction");
  });
});
