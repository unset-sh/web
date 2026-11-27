---
title: "Running the web server"
description: "How the web process starts, the settings it reads and what it does with every request."
weight: 20
type: docs
params:
  doc_kind: guide
---

The web process is SvelteKit's adapter-node build, served by `server.ts` on Bun:

```sh
bun run build
bun server.ts
```

Settings come from the environment and are checked before the server listens. A missing or invalid setting stops
the process with exit code 78 and names the setting, never its value.

| Setting | Required | What it is |
| --- | --- | --- |
| `UNSET_ENV` | yes | `dev`, `test` or `prod`. Plain `http:` origins are allowed only in `dev`. |
| `UNSET_SERVICE` | yes | Always `web`. |
| `UNSET_COMMIT` | yes | The full commit the image was built from. All zeros is allowed only in `dev`. |
| `LISTEN_PORT` | yes | The port to listen on, 1024 to 65535. |
| `PUBLIC_ORIGIN` | yes | The site's public origin, such as `https://unset.sh`. |
| `HTTP_ALLOWED_HOSTS` | yes | Comma-separated hosts the server answers for. It must include the public origin's host. A leading dot (`.example.sh`) allows exactly one label below it. |
| `TRUSTED_PROXY_MODE` | yes | `header` when an edge proxy names the client, `socket` when there is none. |
| `TRUSTED_PROXY_HEADER` | in `header` mode | The one header the edge sets, such as `x-forwarded-for`. |
| `TRUSTED_PROXY_CIDRS` | in `header` mode | The edge's addresses, as CIDRs. |
| `TRUSTED_PROXY_HOPS` | no | How many trusted proxies append to the header. Default 1. |
| `REQUEST_DEADLINE_MS` | no | How long a request may run, 5000 to 60000. Default 30000. |
| `SHUTDOWN_GRACE_MS` | no | How long requests in flight may finish after SIGTERM. Default 10000. |
| `HTTP_BODY_LIMIT_BYTES` | no | The default body limit. Default 65536. |
| `RATE_LIMIT_MAX_KEYS` | no | Rate-limit buckets held at once. Default 100000. |
| `SEARCH_LISTING` | no | `off` (the default) puts `noindex` on every response and blocks crawling. `on` permits only explicitly eligible public pages and the default brand sharing image. |
| `BACKEND_URL` | yes | Backend's internal API as an origin, reached on the private network only. The browser never calls it. Outside `dev` and `test` it must be `https:`, and web shows its client certificate (mutual TLS); plain `http:`, such as `http://backend:3000`, is allowed only in `dev` and `test`. |
| `BACKEND_TLS_CERT_FILE` | with `https:` | A file holding web's client certificate (PEM), `web.crt`. |
| `BACKEND_TLS_KEY_FILE` | with `https:` | A file holding that certificate's private key (PEM), `web.key`. |
| `BACKEND_TLS_CA_FILE` | with `https:` | A file holding the CA that signed backend's certificate (PEM), `server-ca.crt`. Web trusts only this CA for backend. |

The three certificate files come from `unset-sh/deployment`'s `scripts/internal-tls.sh`, which Alex runs once per
environment; its runbook (`docs/site/internal-tls.md` there) says where each file goes and how to renew it. Staging
and production each have their own certificates. All three are set or none is: a partial set refuses to start.

## What every request gets

- A host check. A request for a host that is not allowed gets 421, and one with no host gets 400. `/health` is
  exempt, so the container probe always reaches it.
- Security headers on every response, files and refusals included: a Content-Security-Policy, `nosniff`,
  `same-origin` referrer and cross-origin policies, `DENY` framing and HSTS.
- A rate limit per client address and a site-wide ceiling. In `socket` mode only the ceilings apply, because every
  request comes from the edge.
- Only `GET`, `HEAD` and `POST`. A `POST` must be a form, from the site's own origin, to a route that takes a body,
  with a declared length within that route's limit.
- A deadline. Past it the visitor gets 503.
- One log line per response, naming the route template, the method, the status and the time taken. It never holds
  the path, a query, an address or an account.

Each route folder has a `policy.ts` beside its page or endpoint. It names the route's group, rate limit and body
limit. A route without one is refused.

## Search and sharing

The homepage's title, description, canonical URL, sharing tags and WebSite structured data are present in its
initial HTML. The canonical origin comes from `PUBLIC_ORIGIN`, never a request header or query parameter.
`/sharing/unset.png` is the standard 1200 × 630 Unset card when there is no specialised image.

With `SEARCH_LISTING=off`, `/robots.txt` disallows crawling and `/sitemap.xml` contains no entries. With it `on`,
robots permits crawling so search engines can read each page's indexing instructions; the sitemap lists only
eligible public pages, currently the homepage. Sign-in, account, data, health, redirects and error responses stay
`noindex` independently of this setting. Authentication still controls access to account data.

Changing the setting requires restarting the process. It does not publish new routes, approve a launch or
guarantee a search result. To inspect a configured instance, request `/`, `/robots.txt`, `/sitemap.xml` and
`/sharing/unset.png`, and compare their HTML/headers with the expected setting. `bun run check` exercises both
modes against the built server. If removing previously indexed pages, allow crawlers to read `noindex` or use the
search engine's removal procedure; a crawl block alone does not remove existing results.

See [Adding public page metadata](seo.md) for the route and content requirements.

`/health` answers 200 with the service and commit while the server runs, and 503 once it is draining. SIGTERM stops
new connections, lets requests in flight finish within the grace period, and exits 0.

## Signing in

Web holds no grant and no account data. It keeps three cookies, all `__Host-`, `Secure` and `HttpOnly`:

- `__Host-sid`: the session token backend issued, sent to backend as a bearer header on every call for the member.
- `__Host-oauth_nonce`: for ten minutes during a sign-in, the random value backend checks at the callback, so a
  callback another browser started is refused.
- `__Host-login_target`: for two minutes, where `/login/continue` sends the browser next. It is `SameSite=Strict`,
  so only our own sign-in form leads there.

`/login` takes a handle and sends the browser to that account's server, which sends it back to `/auth/callback`.
`/profile` needs a session; without one it sends the visitor to `/login`. `POST /logout` ends this browser's session
only, and the account's other browsers stay signed in.

## The image

`Dockerfile` builds the image that deployment runs: `vite build` in a build stage, then a distroless Bun 1.4.4 stage
that runs `bun server.ts` as uid 65532 with no `node_modules`, because the build bundles every dependency. The image
takes every setting above from its environment and holds no secret. Its health check calls `/health` on
`LISTEN_PORT`.

Each merge into `staging` builds it in CI and pushes it by digest to `ghcr.io/unset-sh/staging/web`, through tooling's
shared staging image workflow (`.github/workflows/image-staging.yml`). The install reads `@unset-sh/brand` from GitHub
Packages, so the workflow hands the run's own read token to the build as the BuildKit secret `github_packages_token`.
To build it yourself:

```sh
GITHUB_PACKAGES_TOKEN=<a read:packages token> docker build --secret id=github_packages_token,env=GITHUB_PACKAGES_TOKEN .
```
