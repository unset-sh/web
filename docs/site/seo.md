---
title: "Adding public page metadata"
description: "How public pages supply metadata, search consent and a sharing image."
weight: 30
type: docs
params:
  doc_kind: guide
---

Every new public route supplies its SEO data in its server load, after checking that the content may be shown.
The shared component renders metadata in the initial HTML. Private routes keep their existing page titles and
receive `noindex` by default.

## Add a public page

1. Render useful content, a descriptive H1 and ordinary navigation links on the server. Return an actual 404 for
   missing content and preserve authorization, publication and removal rules.
2. Pass a `PublicPage` to `publicPageSeo` in `src/lib/server/seo.ts`, with the validated server configuration.
   Supply a canonical local `path`, visible `title` and `description`, and explicit `searchVisible` consent.
   The launch setting and this consent must both permit indexing. Queries and fragments are not canonical paths.
3. Return `{ seo }` from the load and set `locals.searchVisible = seo.indexable`. Add `search: true` to the route's
   `policy.ts` only when the route is intended for public search. The hook also requires a successful HTML response;
   a missing flag, error or data request remains excluded. See `src/routes/+page.server.ts` for the current example.
4. Include eligible canonical pages in the sitemap using the same `isSearchVisible` predicate. `PUBLIC_PAGES`
   currently contains only the fixed homepage. Dynamic content must be queried from authorized public records;
   do not enumerate account routes or assume a public page permits search listing.
5. Add response tests to `src/seo.test.ts` for listing off/on, private or removed content, canonical variants,
   error statuses, metadata and image availability. Run `bun run check` from the web repository with its pinned
   dependencies installed.

## Choose a sharing image

Omit `image` to use the fixed Unset card. Its bytes come from the full brand commit in
`static/sharing/source.json`; `scripts/sharing.test.ts` checks the copied asset's hash and dimensions. The source
commit and asset licence travel with the copy. Once a brand release includes it, adoption can move to that exact
package export.

For a specialised card, supply a publicly served local image path, alternative text, width and height. Rendering
owns templates drawn from profile, post and article data; web must not create a second renderer. Supply only
authorized public data to its public API, serve the successful PNG at a stable URL, and omit `image` after a typed
render failure to use the standard card. Cache identity must include the supplied input, options and renderer
version; visibility and removal checks must also apply to image requests. Public image responses need their own
explicit indexing policy; the current server exception covers only the fixed brand card.

The web app does not yet call the rendering package: there are no public content routes to feed it, and its
brand 0.1.0 contract still requires a separate migration. This metadata contract accepts their image URLs when
those routes are implemented.

## Describe the visible content

The homepage emits only accurate `WebSite` data. Future pages can supply `structuredData`; the component serializes
it safely as JSON-LD. Use the matching schema and actual visible fields: `ProfilePage` for a public creator,
`Article` or `BlogPosting` for an article, and `DiscussionForumPosting` for a genuine discussion. A community
collection links to its public entries. Do not invent dates, replies, counts, ratings or content to qualify for a
search feature. Blog feeds, public profiles, communities and their schemas arrive with those features.

Google selects result presentation. Markup establishes eligibility, not a guaranteed result or ranking. Read its
[structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies),
[profile guidance](https://developers.google.com/search/docs/appearance/structured-data/profile-page),
[article guidance](https://developers.google.com/search/docs/appearance/structured-data/article),
[discussion guidance](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum) and
[image indexing controls](https://developers.google.com/search/docs/crawling-indexing/prevent-images-on-your-page).
