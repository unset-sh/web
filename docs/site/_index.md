---
title: "Web"
description: "The unset.sh web application: routes, server rendering, screens and web-specific integrations."
type: docs
cascade:
  type: docs
menus:
  main:
    weight: 100
params:
  doc_kind: overview
---

`unset-sh/web` will hold the complete unset.sh SvelteKit application: routes, server rendering, layouts, feature
screens, navigation, client state, web sessions and the web image build.

**Status: foundation.** A SvelteKit 3 application on Bun with its checks and a health route. Screens, sign-in and
the image arrive step by step, reusing code from [Undefined6799/unset](https://github.com/Undefined6799/unset),
which stays read-only.

## What belongs here

- SvelteKit routes, server rendering and request and response presentation.
- Feature screens, interactions and client state, organised around what a person does.
- Web sessions, form decoding and web-specific edge adapters.
- Client capability interfaces and their backend and device adapters, including messaging screens and the
  device-side protocol and encryption integration. Device keys stay on the device.
- Web tests and the web image build.

Authorisation, product operations and private data access belong in
[backend](https://github.com/unset-sh/backend). Neither browser code nor server rendering imports backend database
drivers or administrative code; server rendering calls supported backend operations.

## What it uses

- [Brand](https://github.com/unset-sh/brand) tokens, fonts and assets, at pinned versions.
- Supported [backend](https://github.com/unset-sh/backend) APIs and published
  [lexicons](https://github.com/unset-sh/lexicons).
- [Rendering](https://github.com/unset-sh/rendering) for images drawn from data.
- [Deployment](https://github.com/unset-sh/deployment) selects and runs the released web image.

The [repository README](https://github.com/unset-sh/web#readme) has the full ownership notes. This section is
exported from `docs/site/` in `unset-sh/web`; edit it there.
