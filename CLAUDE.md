# CLAUDE.md: unset-sh/web

## Where this repository fits

This is `unset-sh/web`: Unset's complete SvelteKit web application and device-side integrations.

- **Belongs here:** routes, SSR, screens, components, interactions, web sessions, client capability interfaces,
  backend/device adapters, messaging UI, web tests and producer image builds.
- **Does not belong here:** authoritative server operations, private data adapters or migrations
  (`unset-sh/backend`); environment topology (`unset-sh/deployment`); canonical brand values (`unset-sh/brand`),
  protocol schemas (`unset-sh/lexicons`) or shared automation (`unset-sh/tooling`).
- **Uses:** planned supported backend APIs and pinned brand/lexicon artifacts, tooling and agent-kit; rendering
  where its rendering responsibility is needed. **Used by:** web users and
  deployment's artifact selection.
- **Licence:** AGPL-3.0-only first-party work; no outside code contributions for now. Third-party licences remain.

Read the [organisation map](https://github.com/unset-sh/.github/blob/main/MAP.md) before moving responsibility.
When responsibility, dependencies or outputs change, update `unset-sh/.github`'s `repos.json`, regenerate its
map with `npm run map`, and update this section in the same piece of work.

## Rules

- The original `Undefined6799/unset` stays read-only. Alex, 2026-11-23: reuse its code wherever it fits rather
  than reinvent it ("the idea is to reuse as much code as possible while doing that migration"). Copy the
  files and tests a change needs, change only what the move requires in a separate commit, cite the source
  path and commit, and note weak spots in agent-kit. Never copy a security weakness or relax an existing
  security boundary.
- Keep the complete SvelteKit app here. Organize meaningful features together; routes decode web requests and
  present results. Backend owns authoritative operations. Browser and SSR code never import its private adapters.
- Keep screens independent of provider SDKs through purposeful capability interfaces. Place concrete adapters
  on the server or device according to runtime and trust requirements; do not force every integration into backend.
- Preserve messaging origin, session and key isolation unless explicitly replaced by a reviewed decision.
  A single source repository does not require a single deployment origin. Device encryption keys stay on-device.
- Consume public brand artifacts instead of maintaining token copies. Validate untrusted runtime inputs; static
  types do not replace validation or backend authorization. Add meaningful browser/server import checks with code.
- Own web image builds and configuration/health contracts; deployment owns selected releases and environment wiring.
- Human guides belong under `docs/` when needed. AI working notes and artifacts belong in agent-kit. Do not claim
  installed shared rules, automated adoption or release enforcement before they have been configured and verified.

## Commands

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check   # svelte-check on TypeScript 7 (--tsgo), Biome, vite build, then Vitest under Bun
bun run dev     # Vite's dev server
bun run start   # bun server.ts: serve build/ (settings in docs/site/running.md)
```

Bun is the runtime (`.bun-version`, `bunfig.toml`, `bun.lock`; 7-day release age, no lifecycle scripts). Tests run
with `bunx --bun vitest`. `typescript` stays on 6 because SvelteKit and svelte-check load its compiler API; the
checker is TypeScript 7 as `@typescript/native` (`scripts/typescript.test.ts`). Gate tests (`src/gate.test.ts`) run
against the build. CI runs tooling's Bun check and `pr-policy`. The agent-kit copy is not installed yet.
