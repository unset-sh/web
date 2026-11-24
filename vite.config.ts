// SvelteKit 3 takes its options through the sveltekit() plugin; svelte.config.js is refused (@sveltejs/kit 3.2.0
// src/exports/vite/index.js, config_file_unsupported). From the old app's interfaces/web/vite.config.ts. The CSP: mode
// "hash" adds the sha256 of the startup script SvelteKit writes; hooks.server.ts narrows 'self' in the file directives
// to our paths at runtime. Trusted Types names the policies Svelte 5.57.3 and SvelteKit create (svelte
// src/internal/client/dom/reconciler.js, kit src/runtime/server/page/render.js). No prerendering: every response
// passes the hook.
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Never inline an imported file as a data: URL (Vite 8 build.assetsInlineLimit, default 4096 bytes): no policy here
  // allows data:. Every file is emitted under /_app/ instead.
  build: { assetsInlineLimit: 0 },
  // tw-animate-css 1.4.0 exports only a "style" condition; externalised in the SSR build, Vite resolves it with Node's
  // conditions and fails, so the SSR build bundles it (agent-kit notes/web-ui-spike/README.md, step 2).
  ssr: { noExternal: ["tw-animate-css"] },
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),
      // A small core plus one piece per route and per shared module, each content-hashed under /_app/immutable/ (kit
      // 3.2.0 src/exports/vite/public.d.ts, output.bundleStrategy, the default), so a piece loads on demand.
      output: { bundleStrategy: "split" },
      csp: {
        mode: "hash",
        directives: {
          "default-src": ["none"],
          "script-src": ["self"],
          "style-src": ["self"],
          // One fixed style attribute, allowed by exact hash only: SvelteKit's route announcer
          // (kit src/runtime/components/root.svelte).
          "style-src-attr": ["unsafe-hashes", "sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo="],
          "img-src": ["self"],
          "font-src": ["self"],
          "connect-src": ["self"],
          "form-action": ["self"],
          "base-uri": ["none"],
          "frame-ancestors": ["none"],
          "object-src": ["none"],
          "manifest-src": ["self"],
          "require-trusted-types-for": ["script"],
          "trusted-types": ["svelte-trusted-html", "sveltekit-trusted-url"],
        },
      },
    }),
  ],
});
