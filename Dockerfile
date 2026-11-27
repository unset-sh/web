# The web image: `bun server.ts` around SvelteKit's built handler (adapter-node's custom server). The build stage runs
# `vite build`, which bundles every dependency into build/ (they are all devDependencies, which adapter-node bundles;
# @sveltejs/adapter-node 6.0.2 README "Deploying"), so the runtime carries no node_modules: only build/, server.ts
# and the server sources server.ts imports, which Bun runs as TypeScript.
#
# Both stages use the official Bun 1.4.4 images (.bun-version), pinned by their multi-arch index digests, the same as
# backend's (https://hub.docker.com/r/oven/bun, tags 1.4.4-slim and 1.4.4-distroless, published 2026-10-22). The
# runtime stage is distroless (no shell, no package manager). scripts/image.test.ts holds every FROM to a digest.
#
# @unset-sh/brand comes from GitHub Packages, which needs a read token even to install. It reaches `bun install` only
# as the BuildKit secret `github_packages_token`, mounted as an environment variable for that one RUN, so it is in no
# layer, build argument or image setting (https://docs.docker.com/reference/dockerfile/#run---mounttypesecret, `env`
# option). The image carries no secret: deployment supplies each <KEY>_FILE at run time.

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
# Exactly as locked, with no lifecycle scripts (bunfig.toml). A build without the secret fails here, never silently.
RUN --mount=type=secret,id=github_packages_token,env=GITHUB_PACKAGES_TOKEN,required=true \
  bun install --frozen-lockfile --ignore-scripts
COPY tsconfig.json vite.config.ts server.ts ./
COPY scripts/system-theme.ts /app/scripts/system-theme.ts
COPY static /app/static
COPY src /app/src
RUN bun run build

FROM oven/bun:1.4.4-distroless@sha256:153a951ae40106e125898103e6e990ee0f38e6aee7f561029e26cf9fbed23470 AS runtime
LABEL org.opencontainers.image.source="https://github.com/unset-sh/web"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production
WORKDIR /app
# package.json for its `imports` map (#kit/handler, #kit/manifest), which server.ts resolves to build/.
COPY package.json bunfig.toml tsconfig.json server.ts ./
COPY --from=build /app/build /app/build
# The sources server.ts imports at run time; .dockerignore keeps the tests out.
COPY src/lib/errors /app/src/lib/errors
COPY src/lib/server /app/src/lib/server
COPY src/lib/seo.ts /app/src/lib/seo.ts
COPY src/routes /app/src/routes
# The base runs as root; web does not need it.
USER 65532:65532
# GET /health on LISTEN_PORT, which skips the host check and the rate limit (src/lib/server/policy.ts). Exec form, as
# there is no shell.
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.LISTEN_PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["bun"]
CMD ["server.ts"]
