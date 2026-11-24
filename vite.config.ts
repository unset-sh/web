// SvelteKit 3 takes its options through the sveltekit() plugin; svelte.config.js is refused (@sveltejs/kit 3.2.0
// src/exports/vite/index.js, config_file_unsupported). adapter-node writes build/, which `bun build/index.js` serves.
// The request gate, CSP and security headers come with the next step, copied from Undefined6799/unset.
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
});
