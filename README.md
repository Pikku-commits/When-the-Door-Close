# When the Door Close

A React scrapbook that opens into a two-page book on desktop and one page on small screens. Readers use pen names to contribute to the shared journal without creating an account. A Cloudflare Worker serves the UI and API, with D1 for entries and replies and R2 for attachments.

## Run locally

1. Run `npm ci && npm run build` with Node 20 or newer.
2. Run `npx wrangler d1 migrations apply DB --local` and `npx wrangler dev`.
3. Open the local address Wrangler prints. Rebuild after source changes.

The D1 migration initializes entries, threaded margin notes, appreciation hearts, reports, and rate-limiting counters. Chapters and the rotating daily questions are defined in `src/data.js`. Capsule opening dates and daily questions use UTC. Uploads require a working R2 binding.

## Deploy

The hosted app uses the Sites project in `.openai/hosting.json`. Build with `npm run build`, then package the Worker and the `drizzle/` schema migrations for Sites deployment. The host provisions the declared `DB` and `BUCKET` bindings.

For your own Cloudflare deployment, create a D1 database and a private R2 bucket. Update the database ID and names in `wrangler.toml`, then run `npm ci && npm run build`, `npx wrangler d1 migrations apply DB --remote`, and `npx wrangler deploy`. GitHub stores the source and Cloudflare runs the backend.

| Variable | Purpose |
| --- | --- |
| `ADMIN_KEY` | Secret of at least 24 characters. Enter it at `/moderate` to review reports, hide reported pages or notes, and dismiss reports. The moderation API denies access until a key is configured. |
| `RATE_LIMIT_SECRET` | Random secret for hashing temporary rate-limit buckets. Keep private and stable across deployments. |

Set secrets in the site’s environment settings and redeploy. For a standalone Cloudflare deployment, use `npx wrangler secret put ADMIN_KEY` and `npx wrangler secret put RATE_LIMIT_SECRET`. For local testing, put secrets in the ignored `.dev.vars` file.

## Privacy and storage

Shared pages are readable by anyone with the URL. The site requests that search engines skip indexing. A fictional pen name provides pseudonymity. Private pages, draft text, reading progress, bookmarks, and ownership keys stay in the original browser. Private attachments are stored in IndexedDB. Clearing site data can erase private pages and ownership keys. Shared attachments are delivered through the Worker, and the Worker checks capsule dates before serving the entry or its media. Shared photographs are re-encoded in the browser to drop ordinary EXIF metadata. Videos and recordings may contain identifying information.

The original browser can edit shared text and remove shared pages. Shared attachments belong to the original publication. Text drafts auto-save on the device and pending attachments remain available while the editor is open.
