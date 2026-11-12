# Octetlab — v2 data model

Contract of Phase 2 (wave 2.0, K2). Everything the workspace, the engine, the simulator (Phase 3), the
CLIs (Phase 4) and the protocol packs (Phase 5+) build on. Code: `src/domain/**` (types + two pure
classes), `src/lab/migrations/**` (v1 → v2). The v1 model and engine were deleted after integration
(wave 2.3); only the v1 types the migration reads remain, in `src/lab/migrations/v1Types.ts`.

## 1. Principles

- **State vs. canvas.** `NetworkState { devices, links }` is what the engine reads. Positions, notes
  and annotations live in the `LabDocument`; the engine never depends on the canvas.
- **Explicit ports.** Every device has `ports: Port[]`. Links join *physical* ports. Layer-2/3 settings
  sit on the port (or its sub-interfaces); only truly device-wide settings sit on the device.
- **`device.ports` is authoritative.** A `DeviceModel` is a creation template. Ports may later differ
  from it (migrated labs, modules in the physical view 5.9), so nothing may require them to match.
- **Behaviour from configuration, not from `kind`.** The engine decides from port roles and settings
  bags (a port with `l2` switches, a device with `routing.ipRouting` routes). `kind` is for icons,
  palette, defaults and a few kind-only behaviours (hub repeats, cloud provides internet).
- **Illegal states unrepresentable where cheap.** `Port` is a union on `role`, `Link` a union on
  `cable`, `StaticRoute` needs a next hop or an exit interface. What types cannot express is checked by
  `StateInvariants` (§12).
- **Extension points are typed now.** Reserved optional keys of type `never` (e.g. `stp?: never`)
  mark where each pack adds its settings; the pack replaces `never` with its type — non-breaking for
  stored labs and existing code (§8).
- **Naming.** During Phase 2 the types that also existed in v1 carried a `V2` suffix (`DeviceV2`,
  `LinkV2`, `NetworkStateV2`, …). Wave 2.3 deleted v1 and dropped the suffix everywhere (`Device`,
  `Link`, `NetworkState`, `NetworkEngine`, `networkEngine`, …); the v1 shapes the migration reads are
  `V1Device`, `V1NetworkState`, … in `src/lab/migrations/v1Types.ts`. Import from `src/domain`.
- Immutable everywhere; ids camelCase; MACs `AA:BB:CC:DD:EE:FF`; IPv4 and masks dotted strings
  (`''` = none), like v1.

| File | Content |
|---|---|
| `PortTypes.ts` | `Port` union, `L3Settings`, `SwitchportSettings`, `SubInterface`, port enums |
| `DeviceTypes.ts` | `Device`, `DeviceKind`, host / switching / routing / wireless settings |
| `ServiceTypes.ts` | DHCP, DNS, internet cloud (`InternetSettings`) |
| `LinkTypes.ts` | `CableType`, `Link`, `CableRequest`, `CableTool` |
| `NetworkState.ts` | root state |
| `DeviceModel.ts` | catalog contract: `DeviceModel`, `PortTemplate`, `DeviceCapability` |
| `LabDocument.ts` | lab file: meta, layout, annotations, notes |
| `ExerciseTypes.ts` | `ExerciseDefinition`, locks, `SolveCondition`, localized `Exercise` |
| `EngineContract.ts` | `NetworkEngine`, results with `FailureReason`, terminal lines, packet traces, link lights |
| `CableRules.ts` | class: may cable X join port P1 and P2? (§6) |
| `StateInvariants.ts` | class: semantic validation of a state (§12) |
| `MacAddress.ts` | class: validate / normalize / derive MACs |

## 2. Ports

`Port = SwitchedPort | RoutedPort | HostPort | RadioPort | ConsolePort | PassivePort`, all sharing:

| Field | Meaning |
|---|---|
| `id` | Short IOS-style name, unique on the device: `Fa0/1`, `Gi0/0`, `Se0/0/0`, `Console`; hosts `eth0`, `wlan0`, `RS232`; AP `Gi0`, `Radio0`; cloud `eth0…` |
| `medium` | `copper` · `fiber` · `wireless` · `serial` · `console` · `coaxial` (cable modem ↔ cloud, parity list) |
| `mac?` | Own MAC for copper / fiber / wireless / coaxial; absent for serial and console |
| `adminUp` | `false` = `shutdown` / disabled NIC |
| `description?`, `speed?` (`'auto'`, 10…10000), `duplex?` | absent = auto |
| `autoMdix?` | copper; absent = **true** (§6) |
| `pinout?` | copper `mdi` / `mdix`; absent = derived (`CableRules.pinoutOf`) |
| `poe?` | `'auto'` / `'never'` (`power inline`); absent = port cannot source PoE |

| Role | Used by | Extra fields |
|---|---|---|
| `switched` | switch / L3-switch ports, AP uplink, wireless-router LAN ports | `l2: SwitchportSettings` |
| `routed` | router interfaces, L3-switch `no switchport`, WAN ports | `l3`, `subInterfaces: SubInterface[]`, `serial?` |
| `host` | end-device NICs | `l3` |
| `radio` | AP / wireless-router radio (SSIDs on the device) | — |
| `console` | `Console`, `RS232` | — |
| `passive` | hub ports, cloud handoffs | — |

- `SwitchportSettings { mode: 'access'|'trunk', accessVlan, nativeVlan (default 1), allowedVlans: 'all' | number[], features? }`.
  `accessVlan` is kept while trunking (IOS does the same).
- `L3Settings { ipv4: { addressing: 'static'|'dhcp', address, mask }, helperAddresses?, ipv6?: never, features? }`.
  `dhcp` is allowed on routed ports too (`ip address dhcp`); the leased address is stored in `address`.
- `SubInterface { id: '<parent>.<n>', vlan (dot1Q), native?, adminUp, description?, l3 }`. The physical
  port's own `l3` serves untagged frames, i.e. the link's native VLAN (router-on-a-stick).
- `SerialSettings { clockRate? }` — clock on the DCE end; `encapsulation` reserved for 5.7.

## 3. Devices

`Device { id, kind, modelId, name, powered, baseMac, ports, host?, switching?, routing?, wireless?, services?, internet?, features? }`

- `kind`: `internet, router, wirelessRouter, switch, l3Switch, hub, accessPoint, pc, laptop, server,
  printer, ipPhone, pos, camera, nvr, kitchenDisplay, smartphone, tablet`. `END_DEVICE_KINDS` /
  `isEndDeviceKind` name the end devices (they carry `host` and `host` ports).
- `name`: user content in labs; placeholder (= id) in exercises, localized from `exercises:<id>.devices`.
- `baseMac`: burned-in identity (bridge id, SVI MAC). For end devices = MAC of the primary NIC.

| Bag | On | Content |
|---|---|---|
| `host: HostSettings` | end devices | `defaultGateway`, `dnsServers[]`, `appLinks: AppLink[]` (PT-style "global settings"; DHCP overwrites gateway/DNS, last lease wins) |
| `switching: SwitchingSettings` | switch, L3 switch, wireless router | `vlans: VlanEntry[]` (database, always has 1), `svis: Svi[]` (`Vlan<n>`), `defaultGateway` (`ip default-gateway`) |
| `routing: RoutingSettings` | router, L3 switch, wireless router | `ipRouting`, `staticRoutes: StaticRoute[]` |
| `wireless: WirelessSettings` | AP, wireless router | `ssids: { ssid, vlan, security: { mode: 'open' } }[]` |
| `services: DeviceServices` | router, server, wireless router… | `dhcp?`, `dns?` (§4) |
| `internet: InternetSettings` | cloud | `handoffs: IspHandoff[]` (§5) |

`StaticRoute = { prefix, mask, adminDistance } & ({ nextHop, exitInterfaceId? } | { exitInterfaceId })`.
Interface ids are port ids, sub-interface ids or SVI ids (`Vlan10`).

A wireless router (home router) is: `routing` + WAN `routed` port + LAN `switched` ports +
`switching` (VLAN 1 + SVI `Vlan1` = LAN address) + `radio` port + `wireless` + `services.dhcp`.

## 4. Services

- **DHCP** `DhcpServerSettings { enabled, pools: DhcpPool[], excludedRanges: AddressRange[] }`;
  `DhcpPool { id, network, mask, range?, defaultRouter, dnsServers, leases: { mac, ip }[] }`.
  A pool serves requests arriving on the interface whose subnet contains `network` (IOS rule; works
  with relay later). Allocation window = host addresses of `network` ∩ `range` (if set) − exclusions −
  addresses in use; an existing lease for the client NIC's MAC is reused. `range` covers the
  server / home-router style ("start + max users"); IOS pools leave it out and use exclusions.
- **DNS** `DnsServerSettings { enabled, forwarders: string[], records: { type: 'A', name, address }[] }`:
  answer from `records`, else ask `forwarders` in order. Router `ip dns server` + `ip name-server` and a
  DNS server device use the same type. Public names stay the engine's `internetHosts` for now.
- Reserved in `DeviceServices`: `http, ftp, tftp, email, syslog, ntp, aaa` (pack 5.5).

## 5. Internet / WAN

The `internet` device is an ISP cloud with `passive` copper ports (`eth0…`). Each cabled port may
have an `IspHandoff { portId, serviceUp }` (no entry = service up). **A router has internet** when, for
the destination, its routing table (normally a default route) leads out of a routed port whose link
is plugged, both ends `adminUp` and powered, the far end is a cloud port, and that handoff's
`serviceUp` is true. "WAN down" is therefore any of: link unplugged, port shut, cloud off, provider
outage (`serviceUp: false`, link light stays green like a real modem without sync), missing default
route. The same rule works for any topology the user builds. WAN addressing: the WAN port uses
`addressing: 'dhcp'` with an empty address; the rule engine does not need an address on it. Customer
addressing from the ISP (DHCP/PPPoE/static block) is reserved on the handoff for Phase 3 / pack 5.7.
Only routed ports get service; an end device cabled straight to the cloud gets none (v1 behaviour).

## 6. Cables and `CableRules`

`CableType = copperStraight | copperCross | fiber | serial | console | coaxial | wireless`;
`Link = { id, a, b, connected } & ({ cable: plain } | { cable: 'serial', dceEnd: 'a'|'b' } | { cable: 'wireless', ssid })`.
`'auto'` is only a builder tool (`CableTool`); `CableRules.autoCable` resolves it before a link exists.
`connected: false` = unplugged; the link still reserves both ports.

`CableRules` (pure class in `src/domain`, because B1, B2, E2 and the migration all need it):
`check(state, request, ignoreLinkId?)`, `validateLink(state, link)`, `checkEnd(state, end, cable)` (to
highlight usable ports), `autoCable(state, a, b)`, `pinoutOf(device, port)`, `CableRules.mediumOf(cable)`.
Checks in order, first failure wins; `side` names the bad end where it applies:

| # | Rule | Refusal |
|---|---|---|
| 1 | both devices and ports exist | `unknownDevice` / `unknownPort` (+ side) |
| 2 | ends on two different devices (loops wait for STP) | `sameDevice` |
| 3 | connector fits: port medium = cable medium (copper×2, fiber, serial, console, coaxial) | `cableDoesNotFitPort` (+ side) |
| 3w | wireless: one `host` NIC + one `radio`, both wireless | `wirelessNeedsClientAndRadio` |
| 4 | each port holds at most one link (connected or not); radio ports take any number | `portInUse` (+ side) |
| 5 | console: exactly one end is an end device (terminal) | `consoleNeedsTerminal` |
| 6 | wireless: SSID not blank (an SSID the AP does not offer is allowed: misconfigured client) | `ssidRequired` |
| 7 | copper with auto-MDIX **off on both ends**: equal pinouts need crossover, different need straight | `crossoverRequired` / `straightThroughRequired` |

**Auto-MDIX** is on by default (`autoMdix` absent = true), so straight and crossover both work on every
copper link, as on modern gear. Pinout default: MDI-X on switch, L3 switch, hub, cloud and the
switched ports of a wireless router; MDI elsewhere. `autoCable` always proposes the *textbook* cable
(straight MDI↔MDI-X, crossover otherwise) for teaching value, except that an access point is always
cabled straight-through, also to a router (pack 5.2 fix; with auto-MDIX off on both ends a crossover to
an AP is refused with `straightThroughRequired`; the AP port itself stays MDI); serial defaults to
`dceEnd: 'a'`.
CableRules decides what may be plugged in; link lights and traffic are the engine's business
(e.g. serial needs `clockRate` on the DCE end for the line protocol, unknown SSID = no association).

## 7. Device models (catalog contract)

`DeviceModel { id, kind, category, nameKey, ports: PortTemplate[], capabilities: DeviceCapability[] }`.
`PortTemplate { id, medium, role, speedsMbps, poe?, pinout?, group? }`. `nameKey` is a key of the
`catalog` namespace (`catalog:models.<id>.name`). `category`: `routers, switches, wireless, endDevices,
servers, wan`. Capabilities: `routing, l2Switching, l3Switching, wireless, wirelessClient, dhcpServer,
dnsServer, poe, hostTerminal, deviceCli, appLinks, internetService, repeater` — they drive the UI
(sections, terminals, cable ends) and the validator, not the engine. Model ids are never renamed.
Example:

```ts
const router2Port: DeviceModel = {
  id: 'router2Port', kind: 'router', category: 'routers', nameKey: 'catalog:models.router2Port.name',
  ports: [
    { id: 'Gi0/0', medium: 'copper', role: 'routed', speedsMbps: [10, 100, 1000], group: 'lan' },
    { id: 'Gi0/1', medium: 'copper', role: 'routed', speedsMbps: [10, 100, 1000], group: 'wan' },
    { id: 'Console', medium: 'console', role: 'console', speedsMbps: [], group: 'console' },
  ],
  capabilities: ['routing', 'dhcpServer', 'dnsServer', 'deviceCli'],
}
```

## 8. Extension points (protocol packs)

Each key below exists as `key?: never` until its pack gives it a type (plus zod schema, simulator,
CLI, UI); the pack 5.2 keys are typed. Adding optional data never needs a lab migration or a
`schemaVersion` bump; changing existing fields does (§9). An older cached app refuses a lab that uses
newer optional data (zod), and the PWA update flow fixes that.

| Pack | Where |
|---|---|
| 5.1 STP/RSTP/PVST+ | `SwitchingSettings.features.stp`, `SwitchportSettings.features.stp` |
| 5.1 EtherChannel | `SwitchportSettings.features.channelGroup` (+ a `Port-channel` logical interface list added to `switching`) |
| 5.1 port security, CDP/LLDP | `SwitchportSettings.features.portSecurity`, `DeviceFeatures.discovery` |
| 5.2 ACL / NAT (typed, in progress: docs/SECURITY_PACK.md) | `DeviceFeatures.accessLists: AccessListSettings` (`AccessListTypes.ts`), `DeviceFeatures.nat: NatSettings` (`NatTypes.ts`); bindings `L3Features.accessGroups: AclBinding`, `L3Features.natRole: NatRole` (hosts ignore both) |
| 5.2 SSH/Telnet, local AAA · Phase 4 CLI | `DeviceFeatures.management` (hostname, secrets, lines, startup-config; 5.2 adds `domainName`, `users`, `ssh`, vty `transportInput` / `loginLocal` / `accessClass`). `DeviceServices.aaa` stays `never`: local AAA lives in `management.users`, server AAA (RADIUS / TACACS+) waits for the server pack 5.5 |
| 5.3 RIP/OSPF/EIGRP, HSRP | `RoutingSettings.features.{rip,ospf,eigrp}`, `L3Features.{rip,ospf,eigrp,hsrp}` |
| 5.4 IPv6 | `L3Settings.ipv6` (+ IPv6 static routes as a sibling list, `HostSettings` IPv6 gateway/DNS) |
| 5.5 servers | `DeviceServices.{http,ftp,tftp,email,syslog,ntp}`, more `DnsRecord` types; real apps replace `appLinks` |
| 5.6 wireless security, snooping/DAI | `WirelessSecurity` union (`wpa2Personal`…), client key on the host NIC, `WirelessSettings.radio`, `SwitchingSettings.features.{dhcpSnooping,arpInspection}`, `SwitchportSettings.features.{dhcpSnoopingTrusted,arpInspectionTrusted}` |
| 5.7 WAN | `SerialSettings.encapsulation`, `IspHandoff.customerAddressing`, `RoutingSettings.features.bgp`, kinds `firewall`, `modem` |
| 5.8 VTP/DTP, VoIP, SNMP | `SwitchingSettings.features.vtp`, `SwitchportMode` += `dynamicAuto` / `dynamicDesirable`, `SwitchportSettings.features.voiceVlan`, `DeviceFeatures.monitoring` |
| 5.9 physical view, modules | `LabDocument` gets a `physical` layout; modules append ports (allowed: `ports` is authoritative) |

New union members (device kinds, cable types such as a phone/DSL line, failure reasons) are additive
but break exhaustive `switch`es at compile time — intended.

## 9. `LabDocument`

`{ schemaVersion: 2, meta: { title, author?, description?, createdAt, updatedAt (ISO 8601) }, state,
layout: { devices: Record<deviceId, {x,y}>, viewport? }, notes, annotations }`. Annotations: `text`
(size), `rectangle` / `ellipse` (bounding box, label?, filled), `line` (arrow); colours are named tokens
(`neutral, blue, green, amber, red, purple`). Title, notes, labels, device names are user content
(never translated). `LAB_SCHEMA_VERSION = 2`. B2's `LabSerializer` validates with zod, then runs
`StateInvariants`, and chains future migrations `2 → 3 → …` (files in `src/lab/migrations/`).

## 10. Exercises

`ExerciseDefinition { id, order, setting: 'restaurant'|'office'|'shop', lab: { state, layout },
solvedWhen: SolveCondition[], locks: ExerciseLock[] }` — data only; texts stay in the `exercises`
namespace keyed by id (I18N.md §5). `SolveCondition` = v1 conditions (`internet`, `resolves`,
`reachable`, `appLinksOk`) plus `unreachable` (pack 5.2: the target has an address and cannot be
reached). `ExerciseLock`: `{ scope: 'topology' }`, `{ scope: 'link', linkId }`,
`{ scope: 'device' | 'section' | 'port', …, access: 'readOnly' | 'hidden' }`, `{ scope: 'placement',
deviceId }`; sections `power, ports, host, switching, routing, wireless, services, internet, terminal,
security` (5.2: access lists, NAT, users, SSH, domain name). Anything not locked is editable. The
pack 5.2 exercises (`src/scenarios/security`) are written as v2 data, not migrated.
`Exercise` = definition + `texts` (title, complaint, guide ×3, explanation, topics) for the UI.
Note: setting ids are now English; I2 renames `landing:settings.{restoran,ofis,magaza}` accordingly.

## 11. v1 → v2 migration (`src/lab/migrations`)

`migrateV1ToV2(state)`, `migrateV1Layout(state)`, `migrateV1Exercise(definition)` (class
`V1ToV2Migration`). Pure, deterministic, device and link ids unchanged, input untouched.

| v1 | v2 |
|---|---|
| `kind` | same, except `phone` → `smartphone`; `modelId` from `V1_DEVICE_MAP` (switch with any PoE port → `switch8Poe`) |
| `mac` | `baseMac`; also the MAC of the primary port (router `Gi0/0`, AP `Gi0`, cloud `eth0`, host primary NIC). Other Ethernet/Wi-Fi ports: `MacAddress.derive(mac, portIndex + 1)` (locally administered bit set, 2nd octet XOR index). Switches: all ports derived |
| `position` | `layout.devices[id]` |
| router `lan` | `Gi0/0` routed copper; the VLAN-1 interface → its `l3` (description = v1 id), every other interface → sub-interface `Gi0/0.<vlan>` (dot1Q `<vlan>`, description = v1 id; a 2nd interface in one VLAN → `+1000`) |
| router `wan` | `Gi0/1` routed copper, `addressing: 'dhcp'`, no address; `routing = { ipRouting: true, staticRoutes: [0.0.0.0/0 exit Gi0/1, AD 1] }`; routers also get `Console` |
| `wanUp` | `serviceUp` of the cloud handoff on the router's WAN link |
| `dnsForwarding` | `services.dns = { enabled: dnsForwarding, forwarders: ['8.8.8.8'], records: [] }` |
| `dhcpPools` | `services.dhcp = { enabled: true, pools, excludedRanges: [] }`; pool: `network` = rangeStart & mask, `range` = start..end, `gateway` → `defaultRouter`, `dns` → `dnsServers`, leases copied. `vlan` is implied by the subnet (tests prove it matches the VLAN's interface in every exercise) |
| `switchPorts` | 1:1 switched copper ports: `enabled` → `adminUp`, `mode`, `vlan` → `accessVlan`, native 1, allowed `all`, `poe: true` → `'auto'` (false → absent); plus `Console` |
| switch VLANs | `switching.vlans` = VLAN 1 + every VLAN used anywhere in the state (v1 trunks carried every VLAN), names `default` / `VLAN0010` |
| AP `uplink` / `radio` | `Gi0` switched trunk (native 1, all) / `Radio0` radio; `wirelessNetworks` → `wireless.ssids` (`security: open`) |
| host `eth0` / `wlan0` | `eth0` copper (smartphones: `wlan0` wireless) + whichever of the two a v1 link uses. Primary NIC = first linked (eth0 before wlan0), else first: gets `mode/ip/mask`; others `dhcp` without address |
| `host.gateway/dns`, `appLinks` | `host.defaultGateway`, `host.dnsServers`, `host.appLinks` (`targetKind` mapped) |
| internet `wan` | one cloud port per link (`eth0`, `eth1`…), at least `eth0–eth3` |
| `Link` | same id/`connected`; ends mapped; `ssid` or a Wi-Fi end → `wireless`; else `autoCable` (host/router/AP ↔ switch or router ↔ cloud: straight; host ↔ router: crossover) |
| link to a port the v1 device lacks | port created with that id and `adminUp: false` (v1 treated it as dead) |
| `ScenarioDefinition` | `ExerciseDefinition`: `restoran/ofis/magaza` → `restaurant/office/shop`, `locks: []` |

Refused with `V1MigrationError` (programmer error, v1 data only comes from code): link to an unknown
device (`unknownDevice`), two links on one non-radio v2 port, e.g. two switches on router `lan`
(`portShared`), a settings bag on a kind without a v2 place, e.g. `appLinks` on a switch
(`unsupportedSetting`). Tests: all five exercises (ids kept, invariants hold, every v1 field checked
generically, deterministic, input untouched) + per-exercise spot checks of each fault + edge cases.

**Known semantic differences** (no exercise is affected; E2 must keep old tests green or document):
v1 `wanUp: true` without a cloud link (no place → dropped, no internet in v2); v1 ignored the WAN link's
`connected` flag, v2 does not; a host with both eth0 and wlan0 linked keeps its address only on eth0
(v1 fell back to Wi-Fi with the same address); two v1 interfaces in VLAN 1 (the 2nd becomes the
tagged sub-interface `Gi0/0.1`, unreachable through a native-VLAN-1 trunk); v1 let a router answer a
same-subnet ping on an address of another VLAN's interface, v2 answers ARP per interface (found by E2).
**Behavioural equivalence through the engine is E2's job**: every existing engine and scenario test
must pass on `migrateV1ToV2(fixture)` with identical results. (Done in wave 2.1 by an equivalence suite
against the v1 engine; when v1 was deleted in wave 2.3, its fixtures became `officeLab()` / `vlanLab()` in
`src/engine/testNetworks.ts` and every v1 engine test was kept as a plain test with unchanged expectations.)

## 12. Invariants (`StateInvariants.violations(state)`)

Unique device ids, link ids, port ids per device; sub-interface ids `<parent>.<n>` and no clash with
other interface ids (ports, sub-interfaces, `Vlan<n>`); valid and lab-wide unique port MACs (`baseMac`
valid); VLAN ids 1..4094; VLAN database contains 1; every link passes `CableRules.validateLink`
(ends exist, fit, single use…). Returns typed `{ code, deviceId?, portId?, linkId?, reason? }` — B2
maps them to `lab:` messages on import. Not checked yet (engine handles gracefully): layout covers every
device, static-route interface ids exist, pool subnets match an interface.

## 13. Engine rules on v2 (guidance for E2)

`NetworkEngine` = v1 methods on `NetworkState` (`renewDhcp` takes an optional `portId`),
`FailureReason` = the v1 reasons plus `'ttlExpired'` (static-route loops). Reuse v1 reasons otherwise
(shut router interface → `gatewayUnreachable`, shut host NIC → `portDisabled`).
- Link carries traffic: `connected`, both devices powered, both ports `adminUp`; wireless: client SSID
  offered by the radio device; copper pinout rule of §6 when auto-MDIX is off on both ends; serial:
  DCE end has `clockRate` (may be relaxed until 5.7).
- VLANs: access port → its `accessVlan` if in the database; trunk → `allowedVlans ∩ database`, untagged
  = `nativeVlan`; trunk ↔ access mismatches behave like IOS (untagged frames land in the native VLAN).
  Routed port: untagged → native sub-interface, else physical `l3`; tagged `v` → sub-interface with
  `vlan = v` (a native one sends untagged). AP: SSID VLANs bridged to the uplink trunk. Hub: repeats
  everything. Two interfaces share a segment only if frames get through both ways (a native
  sub-interface whose VLAN is not the trunk's native VLAN hears its hosts but its answers land elsewhere).
- Duplicate addresses: NICs and SVIs of non-routing devices (management SVIs) lose a shared address on
  both sides, however it was assigned (static or DHCP); interfaces of routing devices keep it.
- Routing: connected subnets of up interfaces + static routes, longest prefix, then AD; a static route
  whose next hop is one of the router's own addresses is ignored (IOS refuses it). Hosts need the gateway
  in their own subnet. Every reply needs a way back, hop by hop, internet replies included. The engine
  has no NAT (and no ACL) even after pack 5.2: they exist in the simulator only (SIMULATION.md §10.3.7),
  and the cloud still answers private sources there too (SECURITY_PACK.md §2.1); an ICMP error reaches the sender only if the reporting router can route back to it, else
  ping times out and tracert shows `*` for that router. Echo to a broadcast address gets no answer.
  Public destinations follow §5.
- DNS forwarding: router with `services.dns.enabled` resolves via `forwarders` (reachability from
  the router), so v1 "dnsForwarding + wanUp" is preserved by the migrated `8.8.8.8` forwarder.
- DHCP: pool chosen by the subnet of the router interface the request arrives on (§4).

## 14. Ownership, wave 2.1

| Agent | Owns | Uses |
|---|---|---|
| E2 engine | `src/engine/**` | `NetworkEngineV2`, migrated fixtures |
| B1 workspace | `src/features/workspace/**`, `workspace` ns | `CableRules` (`checkEnd` / `check` / `autoCable`), `LabDocument`, catalog |
| B2 lab core | `src/lab/**` except `migrations/`, `lab` ns | zod schemas mirroring `src/domain/v2`, `StateInvariants`, `LAB_SCHEMA_VERSION` |
| C1 catalog | `src/catalog/**`, `catalog` ns, device icons | `DeviceModel`; must contain every id of `V1_MODEL_IDS` (`internetCloud, router2Port, switch8, switch8Poe, accessPoint, pc, pos, printer, ipCamera, nvr, kitchenDisplay, smartphone`) with the ports the migration creates (§11) |

`src/domain/**` and `src/lab/migrations/**` stay frozen in wave 2.1; changes go through the coordinator.

## 15. Open questions

1. **ISP addressing.** WAN ports stay address-less (`dhcp`, empty) until Phase 3 defines how the cloud
   hands out customer addresses (and NAT needs one). OK to defer?
2. **DNS forwarder `8.8.8.8`.** Migration makes the v1 implicit upstream explicit. Alternative: "use
   the DNS learned on the WAN", which needs (1). Keep explicit?
3. **Gateway / DNS per host vs. per NIC.** Host-level (PT "global settings") as briefed; Windows keeps
   them per adapter. Revisit when multi-NIC hosts matter (5.5 servers with two NICs).
4. **Self-loops** (two ports of one switch) are refused until STP exists. Lift in pack 5.1?
5. **Exercise setting ids** switched to English (`restaurant/office/shop`); requires renaming three
   `landing` keys in I2. Acceptable, or keep the Turkish ids?
6. **`wanUp` without a cloud link** is lossy (§11). If any engine test relies on it, E2 should add
   the cloud to the fixture rather than bend the model.
7. Should the catalog expose a `PortFactory` (template → default `Port`) in `src/catalog` (C1) or in
   `src/lab` (B2)? Proposed: C1, since it owns the templates.

### Coordinator decisions (2026-11-06)
1. Defer ISP addressing to Phase 3 — WAN ports stay address-less for now.
2. Keep the explicit `8.8.8.8` forwarder.
3. Keep gateway / DNS per host; revisit with multi-NIC servers (pack 5.5).
4. Refuse self-loops now; lift in pack 5.1 together with STP.
5. English setting ids accepted; I2 renames the `landing:settings.*` keys.
6. Agreed: fix fixtures, never bend the model.
7. `PortFactory` lives in `src/catalog` (C1).

### Cross-agent APIs fixed for wave 2.1 (code against these names)
- **C1** `src/catalog/index.ts`: `deviceCatalog: readonly DeviceModel[]`, `findDeviceModel(id: string): DeviceModel | undefined`,
  `PortFactory.createDevice(model: DeviceModel, id: string, name: string): DeviceV2` (all ports from templates, MACs derived),
  `deviceIconFor(kind: DeviceKindV2): <icon component>` (B1 and the map use it).
- **B2** `src/lab/LabEditor.ts` (pure, immutable, every method returns a new `LabDocument`): `addDevice(doc, device, position)`,
  `removeDevices(doc, ids)` (also removes their links and layout entries), `moveDevices(doc, moves)`,
  `connect(doc, link): { ok: true; doc: LabDocument } | { ok: false; refusal }` (uses `CableRules`), `disconnect(doc, linkId)`,
  `renameDevice(doc, id, name)`, `updateDevice(doc, device)`, `addAnnotation` / `updateAnnotation` / `removeAnnotation`,
  `nextDeviceId(doc, kind)`, `nextLinkId(doc)`. Hook `src/lab/useLabDocument.ts`: `useLabDocument(initial?)` →
  `{ doc, apply(update: (doc) => LabDocument), replace(doc), undo(), redo(), canUndo, canRedo }` with autosave.
- **E2** keeps exporting the v1 engine; the v2 engine is exported as `networkEngineV2: NetworkEngineV2` from `src/engine/index.ts`.
