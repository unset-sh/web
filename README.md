# web

Unset's complete SvelteKit web application: routes, server rendering, screens and web-specific integrations.

**Status: repository foundation only.** No SvelteKit application, dependencies, build, checks, image or
deployment is present yet. The application move from
[Undefined6799/unset](https://github.com/Undefined6799/unset) is pending; that repository remains read-only
during this foundation work.

## Responsibility

Keep the complete web application together rather than splitting its views and framework entry points across
repositories. Organize features around the product behavior a person uses, with small route entry points and
local components, state and tests where appropriate.

| Belongs here | Boundary |
| --- | --- |
| SvelteKit routes, SSR, layouts and request/response presentation | The web framework and browser delivery |
| Feature screens, navigation, interactions and client state | Web product experience |
| Web sessions, form decoding and web-specific edge adapters | Validated web requests and responses |
| Client capability interfaces and their backend/device adapters | Stable product concepts for components |
| Messaging screens and device-side protocol/encryption integration | Device responsibilities stay on the device |
| Web tests and producer image builds | Verifiable web behavior and releasable artifacts |

Web remains a product application: it owns interaction design and presentation decisions, not only API glue.
Authoritative authorization, product operations and private data access belong in
[backend](https://github.com/unset-sh/backend). Neither browser code nor SSR should import backend database
drivers or administrative implementations; SSR calls supported backend operations.

## Technology-independent screens

Components depend on Unset capability interfaces rather than provider SDKs. Adapters translate provider
concepts, errors and events at the appropriate boundary. Some adapters call backend APIs; others run on the
device because the protocol requires local state, connectivity or encryption keys.

Keep UI capability interfaces separate from published network APIs and private backend ports. Preserve
explicit capability and failure states when providers differ; an interface cannot promise identical protocol
behavior. The API schema format and generated-client mechanism are still to be selected against real use cases.

Putting messaging code in this repository does not merge its origin, session or key-isolation boundary with
the main application. Preserve the reviewed security boundary during migration, and document any deliberate
replacement before implementation. Do not send device keys to the backend to simplify an adapter.

## Shared capabilities

- Consume [brand](https://github.com/unset-sh/brand)'s public semantic tokens, fonts and assets at pinned
  versions. Do not maintain copies of shared brand values. Web owns interactions and accessible components.
- Consume supported [backend](https://github.com/unset-sh/backend) APIs and authoritative
  [lexicons](https://github.com/unset-sh/lexicons) artifacts when published; do not import server internals.
- Use [rendering](https://github.com/unset-sh/rendering) for its supported rendering responsibility
  when needed, without duplicating templates or assuming its implementation is browser-compatible.
- Use [tooling](https://github.com/unset-sh/tooling) for reusable CI mechanisms and
  [agent-kit](https://github.com/unset-sh/agent-kit) for shared agent instructions after explicit adoption.
- Keep maintained guides here under `docs/` when needed; [docs](https://github.com/unset-sh/docs) publishes
  source-owned documentation. Keep AI task notes and review artifacts in agent-kit.

[Deployment](https://github.com/unset-sh/deployment) selects and runs released web images. This repository
owns the image build and its configuration/health contract. Shared package releases, dependency updates and
web delivery are separate steps; automatic propagation is not implemented by this bootstrap.

## Working here

Read [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md) and the
[organisation map](https://github.com/unset-sh/.github/blob/main/MAP.md) first.
No install, build, test or run command exists yet. Add supported commands, browser/server import protection
and meaningful behavior checks with the first implementation slice. Do not add empty scaffold folders or
placeholder workflows. Agent-kit installation, CI, releases and application migration remain pending.

## Licence

Copyright (c) 2026 Alex (Undefined6799). First-party work is [AGPL-3.0-only](LICENSE).
No outside code has been added, and outside code contributions are not accepted for now.
Third-party work, if introduced under an approved dependency decision, retains its own licence.
