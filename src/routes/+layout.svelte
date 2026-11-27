<script lang="ts">
import "../app.css";
import favicon from "@unset-sh/brand/logo/unset-mark-on-onyx.svg?url";
import Seo from "#lib/components/Seo.svelte";
import { page } from "$app/state";

let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>
<Seo seo={page.status === 200 ? page.data.seo : undefined} />

{@render children()}
