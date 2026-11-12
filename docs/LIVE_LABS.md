# Live labs: watch an assistant build a lab in real time

Status: contract (2026-11-12). Binding for the server agent (mcp/**) and the app agent (src/**).

## 1. Goal

A lab created through the MCP server gets **one stable live link** for its whole life:
`<APP_ORIGIN>/live/<labId>`. Opened in a browser tab, the lab redraws itself every time the assistant
(ChatGPT, Claude…) changes it, highlights what changed, and shows a feed of the assistant's actions and
command outputs. The viewer is **read-only** in this phase; "Copy to my labs" makes a normal local lab.
Two-way editing is a later phase (§9).

## 2. Why Durable Objects (decision)

Workers KV is eventually consistent: a write can take up to 60 s to be visible elsewhere
(developers.cloudflare.com/kv/concepts/how-kv-works). Live viewing needs read-after-write and push.
One SQLite-backed Durable Object per lab ("LabRoom") holds the document and its version, serialises
writes, and pushes updates to watchers over WebSockets with the **Hibernation API** (no duration
billing while watchers are idle). SQLite-backed Durable Objects are available on the Workers Free plan
(developers.cloudflare.com/durable-objects/platform/pricing).

## 3. LabRoom Durable Object (mcp/src/live/)

- Class `LabRoom` (SQLite-backed; wrangler `durable_objects.bindings` name `LAB_ROOMS`,
  `migrations: [{ tag: "v1", new_sqlite_classes: ["LabRoom"] }]`). One instance per labId
  (`idFromName(labId)`).
- Storage (DO SQLite / storage API, implementer's choice): `doc` (compact LabSerializer text),
  `version` (integer, starts at 1, +1 per write), `expiresAt` (now + 7 days, renewed per write),
  `events` (ring buffer of the last 50 `LiveEvent`s).
- Expiry: an alarm at `expiresAt` deletes all storage (`deleteAll`). Loading an expired room = not found.
- RPC methods (called from the Worker):
  - `create(docText: string): Promise<{ version: number }>` — fails if the room already has a doc.
  - `read(): Promise<{ docText: string; version: number } | null>`
  - `write(docText: string, expectedVersion: number, event: LiveEvent): Promise<{ ok: true; version: number } | { ok: false; reason: 'conflict' | 'notFound' }>`
    compare-and-set on `version` (the DO is single-threaded, so check + write are atomic). On success it
    broadcasts an `update` message to all watchers.
  - `note(event: LiveEvent): Promise<void>` — an event without a document change (e.g. a ping run by
    `run_command` that changed nothing); stored in the ring buffer and broadcast.
- Size: same limit as today (`MAX_LAB_TEXT_SIZE`); a DO storage value limit must be respected —
  check the current per-value limit for SQLite-backed DOs in the docs and chunk or reject accordingly.

## 4. LabStore migration (expand → migrate → contract)

- **Expand**: `LabStore` gets a `LabRoomStore` backend (DO). `create` writes only to the DO.
  `load` reads the DO; if the room is empty, it falls back to KV (`lab:<id>`), and when found copies
  it into the DO (`create`) and keeps serving from the DO. `save` writes only to the DO with
  compare-and-set: `ToolResponder.withLab` loads `{doc, version}`, applies the change, writes with
  `expectedVersion`; on `conflict` it reloads and re-applies once, then fails with a clear ToolError.
- **Migrate**: nothing else needed — KV labs expire by TTL within 7 days.
- **Contract** (≥ 2026-11-20, separate commit): remove the KV fallback and the `LABS` binding.

## 5. Events

```ts
interface LiveEvent {
  version: number          // doc version after the change (or current version for note())
  at: string               // ISO time
  actor: 'assistant'
  tool: string             // MCP tool name, e.g. 'add_device', 'run_command', 'build_lab'
  summary: string          // one English sentence, e.g. 'Added Cafe Router (router3Port).'
  deviceIds: string[]      // devices to highlight (may be empty)
  linkIds: string[]        // cables to highlight
  output?: { deviceId: string; command: string; lines: string[] }   // run_command only, max 200 lines
}
```
Every mutating tool and `run_command` produce exactly one event per call. Summaries are English
(tool output language); the app shows them as user content (not translated) next to translated
chrome.

## 6. HTTP / WebSocket API on the MCP Worker

- `GET /live/<labId>` → `200 { labId, version, doc: <compact text>, events: LiveEvent[] }` or `404`.
- `GET /live/<labId>/socket` with `Upgrade: websocket` → handed to the room (`acceptWebSocket`,
  hibernation). Server → client messages (JSON):
  - `{ type: 'snapshot', version, doc, events }` right after connect,
  - `{ type: 'update', version, doc, event }` after each write,
  - `{ type: 'event', event }` after `note()`,
  - `{ type: 'expired' }` then close when the room is deleted.
  Client → server: only `{ type: 'ping' }` (keep-alive; answered with `{ type: 'pong' }`, use the
  auto-response API if available). Anything else is ignored. Messages > 1 KB from clients close the
  socket.
- CORS / Origin: allow `GET` and the socket only from `APP_ORIGINS` (wrangler var, comma separated:
  the workers.dev app origin and `http://localhost:5300`, `http://localhost:4173`). Reject other
  Origins with 403. The doc is not secret (anyone with the labId already can edit via MCP), but we do
  not want other sites embedding it.
- Rate limit: reuse `MCP_RATE_LIMITER` per IP for `GET /live/*` and socket upgrades.
- At most 20 watchers per room (reject more with 429).

## 7. MCP tool changes (mcp/src/tools)

- Every tool that returns or creates a lab includes `liveUrl` (`<APP_ORIGIN>/live/<labId>`) in
  `structuredContent`, and `create_lab` / `open_sample` / `import_share_link` mention it in the text:
  "Watch it live: <url> (keep this tab open; it updates as I work)". New wrangler var `APP_ORIGIN`.
- `share_link` stays: a frozen snapshot link (`/lab#lab=…`).
- New tool **`build_lab`**: one call that applies, in order, `devices[]` (modelId, name, x?, y?, ref),
  `links[]` (a, b by ref or id, ports?, cable?, ssid?), `hosts[]` (configure_host payloads),
  `cli[]` (deviceRef, config). All-or-nothing: if any step fails, nothing is saved and the result lists
  every failed step with its index and reason; on success one write and one event
  ("Built 9 devices, 8 cables, configured 5 hosts and 1 router."). Optional `labId` (else creates a
  lab with `title`). Limits: 100 devices, 200 links per call.
- Tool descriptions are updated so assistants prefer `build_lab` for building and the single tools
  for small edits, and tell the user the live link once.

## 8. App: `/live/:labId` (src/)

- Config: `VITE_LIVE_API_ORIGIN` (default `https://octetlabmcp.slovveis.workers.dev`).
- Screen `LiveLabScreen`: read-only workspace (same canvas, device styles, device tabs/windows in
  read-only mode as exercises/samples use for locked labs — reuse their locking, no editing, no
  autosave into the user's labs). Header: lab title, a "Live" status pill (connecting / live /
  reconnecting / ended), "Copy to my labs" (creates a normal lab from the current doc and opens it).
- Applies `snapshot` / `update` by parsing `doc` with `labSerializer.parse` (validate at the boundary;
  on failure keep the last good doc and show an error toast). Ignores messages with `version` ≤ the
  current version. Keeps the user's viewport (no refit on every update; refit only on the first
  snapshot and when new devices appear outside the view — implementer's choice, report it).
- Highlight: devices/links in `event.deviceIds` / `linkIds` glow for ~2.5 s (respect reduced motion).
- Activity feed (collapsible side or bottom strip): newest first, time + summary; `output` shown as a
  monospace block (the command and its lines).
- Reconnect with backoff (1 s → 30 s), fetch `GET /live/<id>` on reconnect to catch up.
  `404` / `expired` → friendly "This live lab has ended (labs are kept 7 days)" + Copy disabled unless a
  doc is loaded.
- PWA: `/live/*` must use the SPA navigation fallback; the socket is never cached.
- i18n tr + en for all chrome strings.

## 9. Later (not in this phase)

Two-way editing (the user's edits sent to the room, assistant sees them), presence, short links,
an MCP "get_events" tool, KV contract step (§4).
