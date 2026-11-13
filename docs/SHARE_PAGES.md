# Share pages

File → **Share as a page…** turns the open lab into a short, stable public link
`<app origin>/p/<id>`: a frozen snapshot with a read-only topology picture, the title, an optional
author / LinkedIn profile / description, and generated tables (devices with IP and VLAN, VLANs,
subnets). Link previews (LinkedIn, WhatsApp, Slack, …) show the title and a picture of the topology.

The old share (`#lab=…`, the whole lab in the link, nothing uploaded) stays: it is the second File
menu item and the "long link" button of the share dialog.

## 1. What the user sees

- **Workspace → File → Share as a page…** opens the share dialog: title (prefilled from the lab),
  name, LinkedIn profile, description, a privacy note. "Create the link" → the link with Copy, Open
  and Post on LinkedIn. Sharing the same lab with the same texts again returns the same link.
- **`/p/<id>`**: title, "by …", LinkedIn link, date, description, "Open a copy in the lab" (saves a
  copy in this browser's recent labs and opens it), the topology, the tables, "Build your own lab".
  The browser that created the page also sees "Delete this page".

## 2. Pieces

| Piece | Where | Job |
| --- | --- | --- |
| App Worker | `mcp/src/appWorker/` (root `wrangler.jsonc`, `main`) | Runs in front of the static app only for `/p/*` and `/api/*`; serves the share API and injects meta tags into `/p/<id>`. |
| ShareStore Durable Object | `mcp/src/share/` (exported by the MCP Worker `octetlabmcp`) | The one store: SQLite table, dedup, delete tokens, PNG rendering. |
| Shared model | `src/features/share/model/` | Limits, zod schemas, text cleaning, tables, topology layout, API client, token store. Used by the app, the app Worker and the store. |
| UI | `src/features/share/dialog/`, `src/features/share/page/` | Share dialog and share page. |

## 3. Why these Cloudflare pieces

- **Static assets + a Worker only for some paths.** `assets.run_worker_first: ["/p/*", "/api/*"]`
  runs the Worker first for those paths only; every other request is served from assets as before
  (and costs no Worker invocation).
  <https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first>,
  <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>
- **Meta tags on the server.** Link-preview crawlers do not run JavaScript, so `/p/<id>` must carry
  `og:title` / `og:image` in its HTML. The app Worker fetches the SPA shell from `ASSETS` and rewrites
  `<head>` with `HTMLRewriter` (default tags removed, escaped share tags appended).
- **Storage: one SQLite-backed Durable Object** (`idFromName('shares')`). It gives a real
  `UNIQUE(content_hash)` constraint and strong consistency on the Free plan. KV has neither (eventual
  consistency, no constraints; dedup would be check-then-write). D1 would also work, but would be one
  more service to create and bind; the MCP Worker already deploys SQLite Durable Objects (LabRoom).
  Free plan: 5 GB SQLite storage, 100 000 rows written per day, 8 MB per row.
  <https://developers.cloudflare.com/durable-objects/platform/pricing/>,
  <https://developers.cloudflare.com/durable-objects/platform/limits/>
- **PNG made in the Durable Object.** A Free plan Worker request gets 10 ms CPU; a Durable Object
  request gets up to 30 s. Rasterising a 1200×630 SVG with resvg (WebAssembly) does not fit 10 ms, so
  the store renders it **once, at creation**, and keeps the PNG in the row.
  <https://developers.cloudflare.com/workers/platform/limits/>

## 4. Limits and ids

`src/features/share/model/shareLimits.ts`: title 100, author 80, description 600, LinkedIn 200
characters; lab JSON 256 000 characters (compact); request body 300 000 bytes; at most 10 000 shares
in total. Ids: 10 characters `[A-Za-z0-9]` from crypto randomness (≈ 59 bits, not guessable);
an id collision retries with a new id (up to 3 times).

## 5. API (same origin, no CORS)

| Method | Path | Answer |
| --- | --- | --- |
| POST | `/api/shares` | `{doc, title, author, linkedinUrl, description}` → 201 `{id, created: true, deleteToken}` or 200 `{id, created: false, deleteToken: null}` (same content shared before). |
| GET | `/api/shares/<id>` | 200 the record (`Cache-Control: public, max-age=300`), 404. |
| DELETE | `/api/shares/<id>` | `Authorization: Bearer <deleteToken>` → 204, 403, 404. |
| GET | `/p/<id>/og.png` | The PNG (`max-age=86400`; it never changes), or 302 to `/ogImage.png`. |
| GET | `/p/<id>` | The app shell with the share's meta tags; 404 when unknown, 503 when the store fails. |

Errors: `{error, message}` with `error` one of `invalidRequest` 400, `forbidden` 403, `notFound` 404,
`tooLarge` 413, `invalidLab` 422, `tooManyRequests` 429, `unavailable` 503. The app shows a
translated sentence per code; the technical detail goes to the console / Worker log only.

## 6. Page, tables and meta tags

- The SPA renders `/p/<id>` (route `share`) from `GET /api/shares/<id>`; the lab is parsed with the
  normal lab serializer (so old formats are migrated), the tables come from `ShareTableBuilder`.
- Meta tags (`ShareMetaTags`): `<title>`, description (first paragraph of the description, or
  "A network lab by …"), canonical, `og:*`, `twitter:card=summary_large_image`, and
  `robots: noindex` (pages are for people who get the link, not for search results).

## 7. Open Graph picture

`OgImageSvg` draws the topology (`ShareTopology.fit`): cables, coloured circles per device group, the
logo and a colour legend. **It contains no text**: the resvg WebAssembly build has no fonts and
loading one would add ~100 KB+ per font to the store Worker; the title is shown by the preview itself.
A failed render is logged and the share keeps working with the default `/ogImage.png`.

## 8. Dedup and delete tokens

- The store builds a canonical form (lab parsed, then serialized compact, plus the cleaned texts) and
  hashes it (SHA-256). `INSERT … ON CONFLICT DO NOTHING` on `UNIQUE(content_hash)`, then a select by
  hash, all in one SQLite transaction: two identical requests at the same moment get the same id.
- The creator gets a random 32-byte delete token once; the store keeps only its SHA-256 and compares
  in constant time. The app keeps the token in `localStorage` (`octetlab.shareTokens`). A repeated
  share of the same content returns no token (the first creator keeps the right to delete).
- No expiry. Deleting removes the row (lab, texts, picture).

## 9. Abuse limits

- Size limits (§4) checked before parsing; zod with explicit field mapping; the lab must pass the lab
  serializer; text cleaned (`ShareText`: control and bidi characters, `<` `>` removed) and escaped
  again by every renderer (React, `escapeHtml` for meta tags); LinkedIn only as
  `https://www.linkedin.com/in/<handle>`, linked with `rel="noopener noreferrer nofollow ugc"`.
- Writes (POST, DELETE) only from the app origin or `APP_ORIGINS` (dev), 10 per minute per IP
  (`SHARE_WRITE_LIMITER`, Workers rate limiting binding), at most 10 000 shares in total.
- One Durable Object handles all shares: fine for this app's traffic (one object serves hundreds of
  simple requests per second); if it ever is not, shard by id prefix.

## 10. Deploy

1. **MCP Worker first** (`mcp/wrangler.jsonc`): migration `v2` adds the SQLite class `ShareStore`.
   `npx wrangler deploy --config mcp/wrangler.jsonc`.
2. **Then the app** (root `wrangler.jsonc`): now a Worker with `main: mcp/src/appWorker/index.ts`,
   bindings `ASSETS`, `SHARE_STORE` (class `ShareStore` in script `octetlabmcp`),
   `SHARE_WRITE_LIMITER` (namespace `4502`, 10/60 s) and `APP_ORIGINS`. `npm run build`, then
   `npx wrangler deploy`.

Local: `npx wrangler dev --config mcp/wrangler.jsonc` and `npx wrangler dev` (after `npm run build`)
run both Workers; the Vite dev server alone has no `/api/shares`, so the share dialog reports
"service not reachable" there.
