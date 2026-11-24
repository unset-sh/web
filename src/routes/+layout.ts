// No script by default, as in the old app's root layout: a page that runs SvelteKit's client (group "app") says
// `export const csr = true` in its +page.ts; every other page, the error page for an unmatched path included, ships
// none (kit docs, page options: https://svelte.dev/docs/kit/page-options#csr, kit 3.2.0).
export const csr = false;
