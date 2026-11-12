# Octetlab MCP server (ChatGPT / Claude connector)

Goal: the owner adds `https://octetlabmcp.<account>.workers.dev/mcp` as a custom MCP server in ChatGPT
(or Claude) and, from chat (also on the phone), builds labs, configures devices, runs ping /
tracert / show commands, and gets a link that opens the lab in https://octetlab.slovveis.workers.dev.

## Decisions (researched 2026-11-09, Cloudflare docs dated Oct 2026)
- **Stateless `createMcpHandler`** (`agents/mcp/server` + `@modelcontextprotocol/server`), the
  recommended pattern; `McpAgent` is deprecated. Streamable HTTP at `/mcp`.
- **No authentication in v1.** The server keeps no personal data; it only builds and simulates labs.
  Abuse control: Cloudflare Workers rate-limit binding per client IP, input size limits (Octetlab's
  `LAB_LIMITS`, `MAX_SHARE_HASH_LENGTH`), and a lab TTL. OAuth can be added later
  (`@cloudflare/workers-oauth-provider`, split auth worker) without changing the tools.
- **Lab state between tool calls: one `LabRoom` Durable Object per lab** (SQLite-backed, binding
  `LAB_ROOMS`, docs/LIVE_LABS.md): compact serialized LabDocument (`LabSerializer`) + version, kept 7
  days after the last change (alarm → `deleteAll`). Every change is a compare-and-set on the version
  (`ToolResponder.withLab`, one retry). Tools take `labId`. A lab can also be imported from a share link.
  Labs saved before live labs are still read from **Workers KV** (`LABS`, key `lab:<id>`) once and copied
  into their room (expand step; the KV fallback is removed in the contract step ≥ 2026-11-20).
- **Live view**: `GET /live/<labId>` (JSON snapshot) and `GET /live/<labId>/socket` (WebSocket,
  Hibernation API) for the app's `/live/:labId` page; only origins in `APP_ORIGINS`, same per-IP rate
  limit as `/mcp`, at most 20 watchers per room. Every mutating tool and `run_command` adds exactly one
  event (English summary, devices / cables to highlight, command output) to the room's feed.
- **Separate Worker in the same repo**: `mcp/` folder, own `mcp/wrangler.jsonc` (name `octetlabmcp`
  — Cloudflare needs lowercase), entry `mcp/src/index.ts`. It deep-imports Octetlab's pure modules
  (domain, catalog/DeviceCatalog, catalog/PortFactory, lab/LabEditor, lab/LabSerializer,
  lab/LabShareLink class, cli, sim, engine, samples) — never barrels that pull React, i18next,
  idb-keyval or `import.meta.glob`.
- Engine messages that are i18n keys are rendered with the English locale JSON (plain import of the
  needed `locales/en/*.json`), so the model gets real text. ChatGPT answers the user in their language.

## Tools (names camelCase is not allowed by MCP clients? — use snake_case, the MCP convention)
| Tool | Does |
| --- | --- |
| `list_device_models` | catalog: model id, kind, ports summary (optional category filter) |
| `list_samples` | sample lab ids, category, level, English title |
| `create_lab` | empty lab (title) → labId + live link |
| `open_sample` | sample id → new labId + live link |
| `import_share_link` | Octetlab share URL (`/lab#lab=…`) → labId + live link |
| `build_lab` | one call: `devices[]` (ref, modelId, name?, x?, y?), `links[]` (a / b = ref or id, ports?, cable?, ssid?), `hosts[]` (configure_host settings, `deviceId` = ref or id), `settings[]` (configure_device settings, `deviceId` = ref or id), `cli[]` (`deviceRef`, config), `annotations[]` (edit_annotations add items), `description?`, `notes?`; applied in that order, then DHCP leases for waiting end devices; all-or-nothing (rejected IOS lines count as failures) with every failed step listed (`failures[]`: section, index, reason); optional `labId` else a new lab with `title`; ≤ 100 devices, 200 links |
| `get_lab` | title, description, notes; devices (id, name, model, powered, position, ports with IP/VLAN/status, gateway, DNS, `settings`: ssids / dhcp / dns / internetService); links (plugged or not); annotations |
| `update_lab_info` | `title?`, `description?` ("" clears), `notes?` (replace) or `appendNotes?` (add on a new line); LabEditor.updateMeta / setNotes |
| `edit_annotations` | `add[]` ({type: text / rectangle / ellipse / line, at?, from?, to?, text?, size?, color?, width?, height?, label?, filled?, arrow?}), `update[]` ({id, …same fields}), `remove[]` (ids); fields per type checked, LabEditor annotation methods |
| `add_device` | modelId, optional name and x/y (auto layout when absent) → device id |
| `configure_device` | deviceId + any of: `name`, `x`/`y` (move), `ssids[]` ({ssid, vlan?, security?: open}; AP / wireless router), `dhcp` ({enabled?, pools[]?: {name, network, mask, rangeStart?, rangeEnd?, defaultRouter?, dnsServers?}, excludedRanges[]?: {start, end?}}), `dns` ({enabled?, forwarders[]?, records[]?: {name, address}}), `internetService[]` ({portId, up}; internet cloud = ISP outage). Validated by the app's own form models (src/features/deviceConfig/model: GeneralFormModel, SsidFormModel, DhcpPoolFormModel, DnsServiceFormModel, InternetServiceModel), offered where the app shows the card (DeviceSections); lists replace the whole list like the GUI forms; a DHCP change lets waiting clients ask for leases |
| `remove_device` | device id |
| `connect` | deviceA, deviceB, optional ports (else first free compatible port) and cable (else `CableRules.autoCable`); clear refusal text when not allowed |
| `disconnect` | link id (removes the cable) |
| `set_cable_connected` | link id + `connected` (unplug / plug back in; LabEditor.setLinkConnected) |
| `set_power` | device on/off |
| `configure_host` | host NIC: dhcp or static ip/mask, gateway, DNS list; in DHCP mode the device asks for a lease right away |
| `apply_cli_config` | IOS-style config lines on a router/switch (`CliShell.replay`) → resulting running-config excerpt and errors; then waiting DHCP clients ask for leases |
| `renew_dhcp` | `deviceIds?` (absent = every DHCP client): the `ipconfig /renew` exchange (simulator `dhcpRenew` request) for any end device, also cameras / phones / printers, one after the other on one simulator → lease or reason per card |
| `run_command` | one command on a device: host terminal (ping, ipconfig, ipconfig /renew, tracert, nslookup, arp…) or device CLI exec (show …, ping) through the simulator; returns the terminal lines; applies state changes (DHCP) |
| `share_link` | frozen snapshot URL that opens a copy of the lab in the web app (fails clearly when over the share size limit) |

DHCP leases (`DhcpLeases`): build_lab (after all steps), configure_host (dhcp), apply_cli_config and configure_device
(dhcp) let every powered end device whose DHCP card is cabled and has no address ask for a lease, in lab order, on
one simulator; the engine's network with the leases becomes the lab (same as `ipconfig /renew`). Router interfaces
with `ip address dhcp` are not DHCP clients in Octetlab's simulator (the cloud has no ISP DHCP yet:
`IspHandoff.customerAddressing` is reserved); like the app samples, a WAN port reaches the internet with
`ip route 0.0.0.0 0.0.0.0 <WAN interface>`.

Every tool result: short human-readable text plus `structuredContent` where useful; results about a lab
carry `liveUrl` (`<APP_ORIGIN>/live/<labId>`). Errors: `isError` with a clear sentence (validation / not
found / limit / refused / conflict / unexpected), raw details only to `console.error`.

## Configuration (mcp/wrangler.jsonc)
`APP_LAB_URL` (share links), `APP_ORIGIN` (live links), `APP_ORIGINS` (comma-separated origins allowed
on `/live/*`), `LAB_ROOMS` (Durable Object, migration `v1` `new_sqlite_classes: ["LabRoom"]`), `LABS`
(KV, legacy fallback), `MCP_RATE_LIMITER`. The Workers runtime types the Worker uses (DurableObject,
WebSocketPair, …) are declared in `mcp/src/platform/workersRuntime.d.ts` (no @cloudflare/workers-types).

## Rules
Global rules apply: strict TS, no `any`, no kebab-case in our names, files < 500 lines, logic in
classes (one responsibility each), validate every tool input with zod at the boundary, no empty
catch, no secrets in code. Tests with Vitest for the service classes (lab store on in-memory rooms
(`MemoryLabRooms`: the real `LabRoomState` on memory storage) + an in-memory KV fake, tool handlers
end-to-end on a small lab: add PC + switch + router, configure, ping; live events, build_lab, CAS
retry, the `/live` API; editTools.test.ts and dhcpTools.test.ts for lab info, annotations, device settings,
cable plug state and DHCP leases). The `LabRoom` Durable Object stays a thin adapter around `LabRoomState`.
