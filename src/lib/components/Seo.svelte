<script lang="ts">
import { jsonLd, type PageSeo } from "../seo.ts";

let { seo }: { seo?: PageSeo } = $props();
</script>

<svelte:head>
  <meta name="robots" content={seo?.indexable ? "index, follow, max-image-preview:large" : "noindex"} />
  {#if seo}
    <title>{seo.title}</title>
    <meta name="description" content={seo.description} />
    <link rel="canonical" href={seo.canonical} />
    <meta property="og:site_name" content="unset" />
    <meta property="og:type" content={seo.type} />
    <meta property="og:title" content={seo.title} />
    <meta property="og:description" content={seo.description} />
    <meta property="og:url" content={seo.canonical} />
    <meta property="og:image" content={seo.image.url} />
    <meta property="og:image:alt" content={seo.image.alt} />
    <meta property="og:image:width" content={String(seo.image.width)} />
    <meta property="og:image:height" content={String(seo.image.height)} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seo.title} />
    <meta name="twitter:description" content={seo.description} />
    <meta name="twitter:image" content={seo.image.url} />
    <meta name="twitter:image:alt" content={seo.image.alt} />
    {#if seo.structuredData}
      {@html `<script type="application/ld+json">${jsonLd(seo.structuredData)}</script>`}
    {/if}
  {/if}
</svelte:head>
