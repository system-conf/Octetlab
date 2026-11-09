<p align="center">
  <img src="docs/images/banner.svg" alt="Octetlab — a network lab in your browser" width="100%">
</p>

<p align="center">
  <a href="https://octetlab.slovveis.workers.dev"><img alt="Live demo" src="https://img.shields.io/badge/live_demo-octetlab.slovveis.workers.dev-0369a1?style=for-the-badge&logo=cloudflare&logoColor=white"></a>
</p>
<p align="center">
  <a href="https://github.com/system-conf/Octetlab/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/system-conf/Octetlab/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-16a34a"></a>
  <img alt="English | Türkçe" src="https://img.shields.io/badge/i18n-English%20%7C%20T%C3%BCrk%C3%A7e-7c3aed">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-2000%2B-0f766e">
  <a href="#use-with-chatgpt-or-claude-mcp"><img alt="MCP server for ChatGPT and Claude" src="https://img.shields.io/badge/MCP-ChatGPT%20%7C%20Claude-0369a1"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.tr.md">Türkçe</a>
</p>

Octetlab is an open-source network lab that runs entirely in the browser: build a network, cable
it, configure it from a GUI or an IOS-style command line, and watch every packet move in
simulation mode. No installation, no account, works on desktop and tablet. Available in
**English** and **Turkish**, ready for more languages.

<p align="center">
  <img src="docs/images/simulation.gif" alt="A ping in simulation mode: ARP and ICMP packets travel from PC1 through the switch to the router, with the event list below" width="760">
</p>

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/images/sampleLesson.png" alt="A sample lab with its lesson panel"><br><sub><b>Sample labs</b> — a working network plus a short lesson and steps that check themselves</sub></td>
    <td width="50%"><img src="docs/images/simulation.png" alt="Simulation mode with the event list and the PDU inspector"><br><sub><b>Simulation mode</b> — step through every packet, look inside it layer by layer</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/deviceCli.png" alt="IOS-style CLI on a router"><br><sub><b>Device CLI</b> — IOS-style console with abbreviations, ? help, Tab completion and paging</sub></td>
    <td width="50%"><img src="docs/images/darkMode.png" alt="The workspace in dark mode"><br><sub><b>Dark mode</b> — light, dark or follow the system</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/samples.png" alt="The sample lab library"><br><sub><b>Sample library</b> — 24 lessons from addressing to inter-VLAN routing</sub></td>
    <td width="50%"><img src="docs/images/designTasks.png" alt="Design tasks"><br><sub><b>Design tasks</b> — a customer brief, a budget and a live checklist</sub></td>
  </tr>
</table>

## What you can do

- **Build networks** — drag routers, switches (L2 / L3, PoE), hubs, access points, wireless
  routers, modems, servers, PCs, laptops, phones, printers, cameras, NVRs and more onto the map
  (37 device models), connect them with the right cable and see link lights come up.
- **Configure** — ports, VLANs, trunks, SVIs, router-on-a-stick, static and floating routes, DHCP
  (pools, exclusions, relay), DNS, Wi-Fi SSIDs; from the settings panel or from the **device CLI**
  (`enable`, `conf t`, `interface`, `switchport`, `ip address`, `show vlan brief`,
  `show ip route`, `show running-config`, `?` help, Tab completion, `--More--` paging).
- **Test** — a Windows-style terminal on end devices (`ping`, `ipconfig`, `nslookup`,
  `tracert`, `arp -a`).
- **Simulation mode** — a deterministic packet-level simulator: step through ARP, DHCP, DNS, ICMP
  and VLAN tagging event by event, inspect each PDU layer by layer, filter by protocol, and export
  the capture as a `.pcap` file for Wireshark.
- **Sample labs** — 24 short lessons (basics, DHCP, DNS, switching, routing, packet view), each a
  ready lab with "try this" steps that are checked automatically and "break it" ideas.
- **Troubleshooting exercises** — real-world faults in small business networks (a restaurant, an
  office, a shop): find the wrong setting, fix it, verify; a report explains what happened.
- **Design tasks** — a customer brief (small office, restaurant, school, factory, hotel) with
  requirements, a budget and a live checklist; submit for a review and get a handover pack
  (topology, IP plan, VLAN table, port list).
- **Your files** — labs autosave in the browser, export / import as `.agl.json`, share as a link,
  export every device's configuration as text.
- **Preferences** — light / dark / system theme, map labels, grid and snap, animation speed,
  terminal and CLI options.

Octetlab is a learning lab, not a game: no points, no lives, just networks that behave like real
ones. The roadmap (dynamic routing, STP, ACL / NAT, IPv6, wireless security, WAN, servers and more)
is in [docs/PLAN_V2.md](docs/PLAN_V2.md) and [docs/PARITY.md](docs/PARITY.md).

## Use with ChatGPT or Claude (MCP)

Octetlab also runs as an MCP server, so a chat assistant can work in the lab for you — on the
desktop or on your phone. Ask in plain words and it builds a lab (from scratch or from a sample),
adds and cables devices, configures hosts, routers and switches, runs `ping`, `tracert` and `show`
commands, and replies with a link that opens the finished lab in Octetlab.

**Server URL:** `https://octetlabmcp.slovveis.workers.dev/mcp` (no sign-in needed)

How to add it (the exact menu names may differ between versions and plans):

- **ChatGPT:** Settings → Apps / Connectors → add a custom MCP server (developer mode may need to be
  turned on first). Paste the URL above and choose **no authentication**.
- **Claude:** Settings → Connectors → add a custom connector and paste the URL above.

Things to ask:

- "Build a lab with a router, a switch and three PCs on 192.168.10.0/24, then ping PC3 from PC1."
- "Open the inter-VLAN routing sample and show me `show ip route` on the router."
- "Set up DHCP on the router for VLAN 20 and check that the laptop gets an address."
- "Here is my share link: why can't PC2 reach the server?"

Limits: labs are kept for 7 days; the server stores no personal data, only the labs themselves;
60 requests per minute per IP address; tool output is in English (the assistant still answers in
your language). Tool list and design: [docs/MCP_SERVER.md](docs/MCP_SERVER.md).

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # type-check and production build
npm run deploy     # build and deploy to Cloudflare Workers (static assets)
```

## Testing

- **Unit tests:** `npm test` (Vitest, `src/**/*.test.ts`), including golden CLI transcripts and
  an oracle that compares the simulator with the rule engine on generated labs.
- **End-to-end tests:** `npm run test:e2e` (Playwright, `e2e/`). It builds the app and serves it
  with `vite preview` on port 4199, then runs a smoke suite in Chromium (desktop) and at a
  360 × 740 phone size (tests tagged `@mobile`). First time: `npx playwright install chromium`.
  `npm run test:e2e:ui` opens Playwright's UI mode. Variables: `E2E_SKIP_BUILD=1` serves the
  existing `dist/`; `E2E_BASE_URL=<url>` tests a running app instead (e.g. a preview deploy).
  Selectors use English accessible names (`?lang=en`); renaming a label in `src/locales/en`
  may need the same change in `e2e/`.
- **CI** (`.github/workflows/ci.yml`, every push and pull request): lint, e2e type-check, unit
  tests, build, Playwright; the Playwright report is uploaded as an artifact when a step fails.
- **Preview deploys** (`.github/workflows/preview.yml`, optional): every pushed branch is uploaded
  as a Cloudflare Workers preview version; production is not changed. It runs only if the
  repository has the `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID`
  Actions secrets, and is skipped otherwise.

## Add a language

1. Copy `src/locales/en/` to `src/locales/<code>/` and translate every value (keep the keys and
   `{{placeholders}}` unchanged).
2. Add one line to `src/i18n/languages.ts`: `{ code, nativeName, dir }`.

That is all; `npm test` checks that every key and placeholder matches English. Details and the
rules for UI code are in [docs/I18N.md](docs/I18N.md). Device output (Windows `ping`, IOS
`show` commands, …) stays in English in every language, as on real equipment.

## Documentation

Screenshots are generated from the live site with `node scripts/readmeScreenshots.mjs` (Playwright).


| Document | Contents |
|---|---|
| [docs/PLAN_V2.md](docs/PLAN_V2.md) | Roadmap, phases and code rules |
| [docs/PARITY.md](docs/PARITY.md) | Feature checklist against desktop network simulators |
| [docs/MODEL_V2.md](docs/MODEL_V2.md) | Lab model: devices, ports, cables, locks |
| [docs/SIMULATION.md](docs/SIMULATION.md) | Packet-level simulator design |
| [docs/CLI.md](docs/CLI.md) | Device command line |
| [docs/SAMPLE_LABS.md](docs/SAMPLE_LABS.md) | Sample lab library |
| [docs/DESIGN_EXERCISES.md](docs/DESIGN_EXERCISES.md) | Design tasks |
| [docs/PREFERENCES.md](docs/PREFERENCES.md) | Preferences and theme tokens |
| [docs/I18N.md](docs/I18N.md) | Translations |
| [docs/MCP_SERVER.md](docs/MCP_SERVER.md) | MCP server for ChatGPT and Claude |

## Trademarks

Cisco, IOS and Packet Tracer are trademarks of Cisco Systems, Inc. Octetlab is an independent
project, not affiliated with or endorsed by Cisco. The command line follows the widely taught IOS
syntax for learning purposes; all icons, artwork and lab content are original.

## License

MIT — see [LICENSE](LICENSE).
