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
| `SEARCH_LISTING` | no | `off` (the default) puts `noindex` on every response. |

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

`/health` answers 200 with the service and commit while the server runs, and 503 once it is draining. SIGTERM stops
new connections, lets requests in flight finish within the grace period, and exits 0.
