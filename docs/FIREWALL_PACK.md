# Firewall pack: stateful firewall appliance

Contract of the firewall pack, written by the coordinator prelude. Agents A–D build on it and do not
change the shared files listed in §9 (ask the coordinator). Pattern: docs/SECURITY_PACK.md.

Branding (PLAN_V2.md:13): the UI, the locales and the catalog never say "ASA", "Cisco", "Adaptive
Security" or any other vendor product name. The device is a generic **firewall appliance**. The CLI uses
the well-known command syntax (`nameif`, `security-level`, `show conn` …), which is allowed.

## 1. Scope

In scope:

- a new device kind `firewall` with two catalog models (2 ports, 3 ports with DMZ);
- per-interface `nameif` and `security-level`;
- the stateful connection table (TCP, UDP, ICMP echo) with lazy expiry on the virtual clock;
- the security-level rule (higher → lower allowed, replies return; lower → higher needs an ACL);
- `same-security-traffic permit inter-interface | intra-interface`;
- ACLs bound with `access-group <acl> in|out interface <nameif>`, reusing the pack 5.2 ACL engine;
- object NAT (`object network` + `host|subnet` + `nat (in,out) static|dynamic …`), mapped onto the pack 5.2
  NAT engine (see §6.3);
- `show conn`, `show nameif`, `show running-config`, `clear conn`, `packet-tracer` (a config explanation,
  §6.4);
- a GUI card, simulation reason texts, sample labs and exercises.

Deferred:

- zone-based firewall on routers (ZBF, design guide 98628);
- application inspection beyond ICMP (FTP, DNS, HTTP …);
- failover, contexts, VPN, routing protocols on the firewall;
- twice NAT and NAT exemption.

## 2. Decisions (binding)

| # | Decision |
|---|----------|
| D1 | New `DeviceKind` `'firewall'`, not a router with another icon. Not an end device. |
| D2 | ICMP echo is tracked **by default** (lab rule). Device setting `inspectIcmp` (absent = true). Real appliances do not inspect ICMP by default (see §3); the divergence is documented in the UI help text. With `inspectIcmp: false` the replies are treated as new lower → higher traffic. |
| D3 | An interface **without `nameif`** passes no traffic, in or out (lab rule; reason `firewallNoNameif`). |
| D4 | Firewall interfaces start **shut down**, like router interfaces (`PortFactory`). |
| D5 | `packet-tracer` is a pure configuration explanation helper: it evaluates the configured rules for one imagined packet and prints the phases. It sends no packet and changes no runtime. |
| D6 | An ACL on the outside interface matches the **real (post-un-NAT) addresses** of inside hosts (lab rule, as on current appliance software, see §3). |
| D7 | Default hostname / prompt `Firewall` (`CliPrompt.factoryHostname`). |
| D8 | Security level: integer 0–100. Absent = 0, except `nameif inside`, which defaults to 100 when no level is given (verified behaviour, §3). |
| D9 | Same level: blocked unless `sameSecurityInterInterface` (between two interfaces) or `sameSecurityIntraInterface` (in and out of the same interface). |
| D10 | Timeouts (seconds; absent = default): tcp 3600, halfClosed 600, udp 120, icmp 2. |
| D11 | Chain order on ingress: `[FirewallPolicy, AclPolicy, NatPolicy]`; egress runs in reverse (§4). |
| D12 | ZBF is deferred (no work in this pack). |

## 3. Verified behaviour and sources

Marks: **verified** = read in the source; **UNVERIFIED** = not confirmed, keep it as a lab rule and say
so in the help text.

| Behaviour | Status | Source |
|---|---|---|
| Traffic from a higher to a lower security level is allowed by default; lower → higher needs an ACL. | verified | networklessons.com/cisco/asa-firewall/cisco-asa-security-levels |
| `nameif inside` sets level 100 by default; other names default to 0. | verified | same |
| Same-level traffic is blocked unless `same-security-traffic permit inter-interface` / `intra-interface`. | verified | www3-realm.cisco.com note on same-security-traffic |
| ICMP is not inspected by default; echo replies from outside are dropped unless `inspect icmp` or an ACL permits them. | verified | community.cisco.com threads 2092109 and 3885781 |
| `show conn` lists protocol, interfaces, addresses:ports, idle time, bytes and flags. | verified (format) | cisco.com doc 115993 (xlate Q&A) |
| Default timeouts: conn 1:00:00, half-closed 0:10:00, udp 0:02:00, icmp 0:00:02. | verified | community.cisco.com thread 2826863 |
| xlate timer separate from conn timer (default 3:00:00). | verified | community.cisco.com thread 3113668 |
| ACLs match real (untranslated) addresses on current software (8.3+). | verified in the research report; re-check before writing help texts | research report §2 |
| Exact `packet-tracer` output phases and wording. | **UNVERIFIED** | none; agent B prints a generic phase list (§6.4) |
| An interface without nameif passes no traffic. | real devices do not route through it either; exact behaviour **UNVERIFIED** | lab rule D3 |

## 4. Domain types (as implemented)

`src/domain/FirewallTypes.ts`:

```ts
export const SECURITY_LEVEL_MIN = 0
export const SECURITY_LEVEL_MAX = 100

/** L3Features.firewall: on routed ports and sub-interfaces of a firewall. */
export interface FirewallInterfaceSettings {
  nameif: string
  securityLevel?: number // absent = 0 ('inside' = 100)
}

export interface FirewallTimeouts { tcp?: number; halfClosed?: number; udp?: number; icmp?: number } // seconds

/** DeviceFeatures.firewall */
export interface FirewallSettings {
  sameSecurityInterInterface?: boolean
  sameSecurityIntraInterface?: boolean
  inspectIcmp?: boolean // absent = true (D2)
  timeouts?: FirewallTimeouts
}
```

Other domain changes:

- `DeviceKind` gains `'firewall'`.
- `DeviceFeatures.firewall?: FirewallSettings`.
- `L3Features.firewall?: FirewallInterfaceSettings`.
- `DeviceCapability` gains `'firewall'`.

Invariants (`SecurityInvariants`; texts in `lab:invariant.*`):

- `duplicateNameif`: two interfaces of one device have the same nameif.
- `securityLevelOutOfRange`: a level that is not an integer between 0 and 100.

Schemas (`src/lab/schemas/firewallSchemas.ts`):

- `firewallInterfaceSchema` and `firewallSettingsSchema`, both strict objects.
- A timeout is an integer from 0 to 604 800.
- `labSchemas.test.ts` proves at compile time that each schema mirrors its domain type.
- Unique nameifs are checked by the invariant, not by the schema, so a lab with that mistake still loads.

The ACL bindings reuse `L3Features.accessGroups`. NAT reuses `DeviceFeatures.nat` and `L3Features.natRole`. No new
fields.

## 5. Simulator

### 5.1 Chain and verdict logic

`SecurityPolicies.create()` returns `[FirewallPolicy, AclPolicy, NatPolicy]`.

- **Ingress** runs firewall → ACL → NAT (un-NAT of the destination).
- **Egress** runs NAT → ACL → firewall.

The prelude `FirewallPolicy` is a pass-through.

Agent A implements the verdict on a device whose `kind === 'firewall'` (other kinds: always `pass`
with the same packet object). Order of checks for a forwarded packet:

1. The ingress or exit interface has no nameif → drop `firewallNoNameif`.
2. The packet matches a live connection (either direction; 5-tuple on real addresses) → pass. Agent A
   updates `lastUsedAt` / `expiresAt` / `bytes` and the TCP state (FIN → halfClosed, RST → remove).
   - This also covers echo replies when `inspectIcmp !== false`.
3. Same level on in and out:
   - between two interfaces: allowed only with `sameSecurityInterInterface`;
   - in and out of the same interface: allowed only with `sameSecurityIntraInterface`;
   - otherwise drop `firewallSameLevel`.
4. Higher → lower level: allowed unless an ACL bound to the interface denies the packet (`aclDenied`).
5. Lower → higher level: allowed only when an inbound ACL is bound on the ingress interface and permits
   the packet (`aclDenied` otherwise). Without such an ACL → drop `firewallDenied`.
6. A TCP segment that is not a SYN, and matches no connection → drop `firewallNoConnection`.
7. When the packet is allowed and opens a flow (TCP SYN, UDP, ICMP echo request), agent A creates the
   connection on egress. Egress runs after NAT has reversed, so the entry stores the real addresses.

Packets addressed to the firewall itself go through steps 1 and 2 only. That covers ping to an
interface, and SSH / Telnet to the device: the management access rules of pack 5.2 still apply.

Drops conclude with the reason. No ICMP error is sent: firewalls drop silently. If agent A finds a
source that says otherwise, it reports this; it is not a contract change.

ACLs on a firewall (coordinator-approved change): `AclPolicy` returns `pass` with the same packet object
on a device whose `kind === 'firewall'`. FirewallPolicy evaluates the bound `access-group` lists itself
at egress, after the connection lookup and on the real (post-un-NAT) addresses: the inbound list of the
ingress interface, then the level rule, then the outbound list of the exit interface. A deny drops
silently with `aclDenied`, matches count in `aclCounters` and leave `acl:notes.*`. So the replies of a
tracked connection never meet an interface ACL, as on stateful appliances, and D6 holds.

### 5.2 Runtime slots

`src/sim/contract/FirewallRuntime.ts` defines two slots in `RuntimeExtensions`:

- `firewallConnections?: readonly FirewallConnection[]`
- `firewallStatistics?: FirewallStatistics` (created, denied, expired)

Each `FirewallConnection` holds:

- `id`, `protocol`;
- `initiator` and `responder` (ip and port; the ICMP echo id is used as the port);
- `inInterface` and `outInterface` (nameif);
- `state` ('synSent' | 'established' | 'halfClosed' | 'open');
- `createdAt`, `lastUsedAt`, `expiresAt`, `bytes`.

Expiry is lazy, like NatRuntime: every read drops the entries whose `expiresAt` has passed.

### 5.3 Clear table

`clear conn` sends `{ kind: 'clearTable', table: 'firewallConnections' }`. The request travels
`SimulationKernel` → `Ipv4NetworkLayer.onRequest` → `FirewallRuntime.clear(ctx)` (in
`src/sim/policy/firewall/FirewallRuntime.ts`, owned by agent A). The prelude version already empties the
table and returns the count.

### 5.4 Reasons

New `SimReason` codes, with texts in `simulation.json` (en and tr) under `reasons.*`:

- `firewallDenied`
- `firewallNoConnection`
- `firewallSameLevel`
- `firewallNoNameif`

## 6. CLI contract

### 6.1 Modes

`objectNetwork` (`{ kind: 'objectNetwork', name }`) is a config sub-mode:

- prompt `Firewall(config-network-object)#`;
- help header "Network object configuration commands:";
- entered by `object network <name>`, which also creates the object.

### 6.2 Commands (agent B, `src/cli/firewall/**`, set id `firewall`)

All nodes use `when: (device) => device.kind === 'firewall'`. Router-only commands that make no sense
on the firewall are not hidden in this pack.

| Mode | Command | Effect |
|---|---|---|
| interface | `nameif <name>` / `no nameif` | `l3.features.firewall.nameif`; `inside` sets level 100 when no level is set |
| interface | `security-level <0-100>` / `no security-level` | `securityLevel` |
| global | `same-security-traffic permit inter-interface\|intra-interface` (+ `no`) | `features.firewall.same*` |
| global | `access-group <acl> in\|out interface <nameif>` (+ `no`) | the named port's `accessGroups` |
| global | `object network <name>` | enters `objectNetwork` |
| objectNetwork | `host <ip>` / `subnet <ip> <mask>` | the object's address |
| objectNetwork | `nat (<real>,<mapped>) static <ip>\|dynamic interface` | NAT rows, §6.3 |
| global | `timeout conn\|half-closed\|udp\|icmp <h:mm:ss>` | `features.firewall.timeouts` |
| global | `inspect icmp` / `no inspect icmp` (simplified, no policy-map) | `inspectIcmp` |
| exec | `show conn [count]`, `show nameif`, `show interface ip brief` (existing) | views |
| exec | `clear conn` | §5.3 |
| exec | `packet-tracer input <nameif> tcp\|udp\|icmp <src> <sport> <dst> <dport>` | §6.4 |

- `ip address` on interfaces: the existing router command applies (the firewall has routed ports).
- `route <nameif> <net> <mask> <gw>` maps onto `routing.staticRoutes` with the exit interface. Agent B
  decides whether to add it now; otherwise `ip route` works.

### 6.3 Object NAT mapping

The pack 5.2 NAT engine stays the only NAT implementation. Agent B maps the object NAT lines like this:

- `nat (inside,outside) dynamic interface` becomes an overload rule with interface target on the
  `outside` port. The ACL is generated from the object address.
- `static <ip>` becomes a static row.
- `natRole` is set on the two ports.

The mapping lives in agent B's edits. The object names need storage that round-trips through
running-config. Agent B proposes the field (e.g. `FirewallSettings.objects`) to the coordinator **before**
using it: that is a domain and schema change, so the prelude owner adds it.

### 6.4 packet-tracer (D5)

Prints the phases in order. Each phase prints a line with ALLOW or DROP, and the output ends with the
final result:

1. ROUTE-LOOKUP
2. ACCESS-LIST
3. NAT
4. CONN-SETTINGS / level check

It is computed from the configuration with the same pure functions as FirewallPolicy. Agent A exports
them for agent B: `FirewallRules.decide(device, ingressInterfaceId, packetView, exitInterfaceId)`, where
`packetView` is an `AclPacketView` (no `tcpFlags` = a SYN) and `exitInterfaceId` comes from the route
lookup (`null` = addressed to the firewall). No packet is sent. The exact
real-device wording is **UNVERIFIED**, so the output stays generic.

### 6.5 Running-config slots

- **Interface slot 55** (`INTERFACE_LINE_ORDER.firewall`): `nameif`, then `security-level`.
- **Global slot 76** (`RUNNING_CONFIG_ORDER.firewall`), in this order:
  1. `same-security-traffic`
  2. `object network` blocks
  3. `access-group`
  4. `timeout`

  NAT is at 75 and ACLs at 85.

## 7. GUI contract

- Card id `firewall`. It shows when `device.kind === 'firewall'` or the model has the capability
  `firewall`. Its exercise lock is `security` (`LOCK_SECTION_OF`).
- `ExerciseLockPolicy` security data covers `features.firewall`. Per-port nameif and level stay under the
  `ports` lock.
- The prelude `sections/firewall/FirewallSection.tsx` is a placeholder. Agent C adds:
  - the same-security switches;
  - ICMP inspection, with a help text about D2;
  - the timeouts;
  - a read-only connection table view.
- The port editor gains nameif and level fields. Agent C adds them to `PortSecurityModel` /
  `PortSecurityFields`; they are shown only on firewall ports.
- Texts live in the `firewall` namespace (`src/locales/{en,tr}/firewall.json`). The card title is
  "Firewall" / "Güvenlik duvarı".
- Other cards the firewall already gets: ports, routing, access lists, NAT, security (SSH).

## 8. Catalog

`src/catalog/models/security.ts` (category `routers`, subcategory `security`, capabilities `routing`,
`deviceCli`, `firewall`):

| Model | Ports |
|---|---|
| `firewall2Port` | Gi0/0 (wan), Gi0/1 (lan), Console |
| `firewall3Port` | Gi0/0 (wan), Gi0/1 (lan), Gi0/2 (ethernet, DMZ), Console |

Kind sites done in the prelude:

- DeviceDefaults: routing on, no routes.
- Icon `firewall`.
- Model code prefix `FW`.
- DesignLabels order: after internet.
- Prices: 1300 / 1800, kind 1500.
- Front panel `rack`.
- Locales: catalog and workspace names.

Later:

- `mcp/src/lab/LabBuilder.ts` `ROUTER_KINDS` could include `firewall`. mcp is not touched by this
  pack.
- `src/features/share/model/ShareTopology.ts` `GROUPS` needs a `firewall` entry. That file is owned by
  the share-page work.

## 9. Ownership and conflict rules

| Owner | Files |
|---|---|
| Coordinator (prelude) | `src/domain/**`, `src/lab/schemas/**`, `src/sim/contract/**`, `SecurityPolicies.ts`, `Ipv4NetworkLayer.ts`, `SimulationKernel.ts`, `src/cli/contract/**`, `src/cli/core/CliPrompt.ts` / `CliHelp.ts`, `src/cli/commandSets.ts`, `DeviceSections.ts`, `DeviceConfigPanel.tsx`, `ExerciseLockPolicy.ts`, `src/i18n/**`, `simulation.json`, `lab.json`, catalog files, this document |
| A: stateful engine | `src/sim/policy/firewall/**` (FirewallPolicy, FirewallRuntime, FirewallRules, tests) |
| B: CLI | `src/cli/firewall/**` (commands, views, running-config sections, edits, tests) |
| C: GUI | `src/features/deviceConfig/sections/firewall/**`, the nameif / level part of `PortSecurityModel.ts` / `PortSecurityFields.tsx`, `src/locales/{en,tr}/firewall.json` |
| D: content, QA, docs | sample labs and exercises with a firewall, oracle cases, `docs/**` except this file's §2–§7 |

Conflict rules:

1. An agent does not edit a file it does not own. If it needs a contract change, it asks the
   coordinator and waits.
2. Agent B uses agent A's pure rule functions for `packet-tracer`. Until they exist, agent B codes
   against the documented signature, and the coordinator merges in A → B order.
3. Agent B owns the CLI texts (they are plain English). The GUI texts belong to agent C. The reason
   texts belong to the coordinator.
4. No vendor product names anywhere in the UI, the locales or the catalog (see the branding rule above).
5. Every agent runs `npm test`, `npm run lint` and `npm run build` before handing back.

## 10. Required tests

- **A**: one test per verdict step in §5.1 (each drop reason, and the pass on a live connection).
  Also: TCP state changes and RST removal; expiry per timeout; `inspectIcmp` true and false; a
  same-level pair with and without each switch; `clear` count; a non-firewall device gets the same
  packet object.
- **B**:
  - every command, with its `no` form, round-trips through running-config (slots 55 and 76);
  - `objectNetwork` mode entry and exit, plus the `?` header;
  - `show conn` and `show nameif` formats;
  - `packet-tracer` ALLOW and DROP cases;
  - the `Firewall` prompt.
- **C**: the card renders for firewall devices only; the lock follows `security`; nameif and level
  fields appear only on firewall ports; editing them is validated (unique names, levels 0–100).
- **D**:
  - a sample lab (inside / outside / DMZ) that passes the oracle;
  - an exercise where the learner opens a DMZ web server with an ACL;
  - the locale parity tests stay green.
