# Security pack 5.2: ACL, NAT/PAT, SSH/Telnet + local AAA

Status: contract (2026-11-12). The coordinator prelude has landed. It holds the shared types, the hooks, the empty command sets, the GUI cards and the namespaces.

Agents A (ACL), B (NAT), C (SSH/Telnet/AAA) and D (content, QA, docs, cable fix) work in parallel on top of it. Each agent edits **only** the files §11 gives it. A change to a prelude file goes through the coordinator.

## 1. Scope

- **ACL:** standard, extended and named lists, with `permit`, `deny`, `remark` and sequence numbers.
  - Bound with `ip access-group in|out` on routed ports, sub-interfaces and SVIs, and with `access-class in` on vty.
  - Shown by `show access-lists` and `show ip access-lists`, with match counters. `clear access-list counters`. `ip access-list resequence`.
- **NAT/PAT:** inside source translation only.
  - Forms: static (also port forwarding), dynamic pool, pool overload, and interface overload.
  - Interfaces are marked `ip nat inside|outside`.
  - Commands: `show ip nat translations [verbose]`, `show ip nat statistics`, `clear ip nat translation *`.
- **SSH/Telnet + local AAA:**
  - Setup commands:
    - `ip domain-name` (and `ip domain name`), `username … [privilege n] secret|password`
    - `crypto key generate rsa [general-keys modulus n]`, `crypto key zeroize rsa`
    - `ip ssh version|time-out|authentication-retries`
    - vty `transport input`, `login local`
  - Show commands: `show ip ssh`, `show ssh`, `show users`, `show crypto key mypubkey rsa`.
  - Clients: `ssh -l <user> <ip>` and `telnet <ip>`, from hosts (SimTerminal) and from routers (a CliJob).

## 2. Decisions (binding)

1. **The cloud still answers private sources.** NAT is not required for reachability: existing labs and tests keep working. NAT rewrites headers and fills the tables only.
2. **SSH/Telnet scope A.** A session goes as far as connect, authenticate, banner and result:
   - "Open" plus the target's hostname;
   - "% Connection refused by remote host";
   - "% Connection timed out; remote host not responding";
   - "Password required, but none set";
   - "% Authentication failed";
   - ACL / access-class denied.

   There is **no remote prompt** in this wave: a session stack is a later contract change.
3. **vty `login` with no password:** the session is refused with "Password required, but none set". The console rule of CLI.md §5.2 is unchanged: no lock-out.
4. **A binding that names a nonexistent ACL permits all** (`AclDecision.noList`). That IOS does this is UNVERIFIED; this is the lab rule.
5. **RSA keys survive `reload`.** `ssh.rsaKeyBits` is kept by `FactoryReset`, as on IOS, where keys are not part of running-config.
6. **Rule engine divergence (oracle):** `src/engine` knows no ACL/NAT/SSH. Every live check that can be affected uses the simulator. These still use the engine:
   - the app-link lights;
   - `DeviceInfoModel`;
   - design `RequirementChecker` / `HandoverPack`;
   - samples `StepChecker`.

   They ignore ACLs: an accepted divergence, which D documents in SIMULATION.md §10.3. Exercises with ACL conditions must run on `SimSolveChecker`, which `ExerciseAttempt` already uses.
7. **New solve condition `unreachable`** (`fromDeviceId`, `toDeviceId`). It holds when the target has an address and cannot be reached. It is implemented in `SimSolveChecker` and in the engine `SolveChecker`.
8. **New exercise lock section `security`.** It covers:
   - `features.accessLists`, `features.nat`
   - `management.users`, `.ssh`, `.domainName`

   The port-level `accessGroups` / `natRole` fall under the `ports` lock.
9. **No `schemaVersion` bump.** All new data is optional (MODEL_V2 §8). An old cached app refuses a lab that uses it; the PWA update flow handles that.

## 3. Domain types (as implemented)

- `src/domain/AccessListTypes.ts`:
  - `AccessList {name, type, entries}`
  - entry types: `AclEntry = AclRemark | StandardAclRule | ExtendedAclRule`
  - `AccessListSettings {lists}`
  - `AclBinding {in?, out?}`
  - `AclAddressMatch {address, wildcard}`: `any` is 0.0.0.0/255.255.255.255 and `host x` is x/0.0.0.0. No keywords are stored.
  - `AclPortMatch`
- `src/domain/NatTypes.ts`:
  - `NatPool {name, start, end, netmask}`
  - `NatStaticRule`, with optional tcp/udp port forwarding
  - `NatDynamicRule {aclName, target: pool|interface, overload}`
  - `NatSettings {pools, statics, dynamics}`
  - `NatRole`
- `DeviceFeatures.accessLists?`, `DeviceFeatures.nat?`.
- `L3Features.accessGroups?: AclBinding` and `L3Features.natRole?: NatRole`. Hosts ignore both.
- `ManagementTypes`:
  - `LineSettings.transportInput?: VtyTransport[]` (absent = all, [] = none), `loginLocal?: boolean`, `accessClass?: AclBinding`
  - `ManagementSettings.domainName?`, `users?: LocalUser[]`, `ssh?: SshSettings {version?, rsaKeyBits?, timeoutSeconds?, authRetries?}`
- zod mirrors:
  - `src/lab/schemas/securitySchemas.ts`
  - `aclBindingSchema` / `natRoleSchema` in `portSchemas.ts`
  - wired in `deviceSchemas.ts`
  - equality is proven in `labSchemas.test.ts`
- Invariants: `src/domain/SecurityInvariants.ts`, called by `StateInvariants`. The codes are `duplicateAclName`, `aclNumberOutOfRange`, `duplicateAclSeq`, `duplicateNatPool` and `duplicateUser`. Texts are in `lab.json`.
  - A binding to a missing list or pool is **valid**.
  - Number ranges: standard 1-99 and 1300-1999; extended 100-199 and 2000-2699.
- Handlers store factory values as absent keys (`lineCommands.ts` rule).

## 4. GUI shell (prelude)

- `ConfigSectionId` `accessLists`, `nat` and `security` (`DeviceSections.ts`, `DeviceConfigPanel.tsx`). All map to lock section `security`.
- Who gets each card: `accessLists` for devices with `routing`; `nat` for routers that are not L3 switches; `security` for routers and managed switches.
- Placeholder cards: `sections/acl/AccessListsSection.tsx` (A), `sections/nat/NatSection.tsx` (B), `sections/security/SecuritySection.tsx` (C).
- Port editor fields:
  - ACL in / out and NAT role on routed ports. They are already wired to the domain through `model/PortSecurityModel.ts` and `sections/ports/PortSecurityFields.tsx`.
  - A and B may extend these two files. A owns ACL lines and B owns the NAT line; small, coordinated edits only.
- i18n namespaces `acl`, `nat` and `remoteAccess` (en + tr). Each agent edits only its own.

## 5. Simulator hooks

- **PacketPolicy** (`src/sim/policy/PacketPolicy.ts`): `ingress(ctx, {interfaceId, packet, linkBroadcast, event})` and `egress(ctx, {ingressInterfaceId, exitInterfaceId, packet, event})`. Each returns:
  - `{kind:'pass', packet}` (possibly rewritten), or
  - `{kind:'drop', reason, icmp?}`. The caller concludes the event as dropped and sends ICMP unreachable `icmp` (for example `adminProhibited`) from the ingress interface.
- **Policies add notes but never conclude the event.** A device without the feature's configuration must return `pass` with the **same packet object**.
- **Order** (IOS, https://www.cisco.com/c/en/us/support/docs/ip/network-address-translation-nat/6209-5.html):
  - Inside→outside: input ACL → routing → NAT inside→outside → output ACL.
  - Outside→inside: input ACL → NAT outside→inside → routing → output ACL.
  - Implemented by `PacketPolicyChain([AclPolicy, NatPolicy])`: ingress runs front to back, egress back to front.
- **Ingress** runs in `PacketReceiver.receive` for routers and L3 switches, **before** the "for this device" check, so PAT return traffic to the router's WAN IP is translated first.
- **Egress** runs in `PacketForwarder.forward` after routing, with TTL already decremented.
- **Packets the router originates do not pass egress:** no outbound ACL and no NAT on them. That IOS skips the outbound ACL for these is UNVERIFIED.
- **Wiring:** `Ipv4NetworkLayer(policy = SecurityPolicies.create())`. Tests may inject a chain.
- **Runtime** (`src/sim/contract/SecurityRuntime.ts`, slots in `RuntimeExtensions`):
  - `aclCounters: Record<aclName, Record<seq, matches>>`
  - `natTranslations: NatTranslation[]`, with lazy expiry on the virtual clock like ARP; static entries have `expiresAt: null`
  - `natStatistics {hits, misses, expired}`
- **SimReason codes** (texts in `simulation.json` en + tr): `aclDenied`, `natPoolExhausted`, `natNoTranslation`, `vtyAccessDenied`, `remoteLoginFailed`, `remoteAccessDisabled`.
- **SimProtocol `telnet` / `ssh`:** TCP 22/23 with an opaque `RawData` payload (`PduLayers.protocolOf`). Colours, chips and layer 7 are added. Adding them to the event filter chips (`FILTER_PROTOCOLS`, `EVENT_FILTER_PROTOCOLS` in preferencesModel) is agent C's job.
- **`SIM_PORTS.ssh = 22`, `SIM_PORTS.telnet = 23`.**
- **Remote connect:**
  - `SimRemoteConnectRequest {kind:'remoteConnect', deviceId, protocol, targetIp, username?, password?}` → `RemoteConnectResult {protocol, targetIp, outcome}`.
  - `outcome` is `{ok:true, hostname, bannerMotd?, privilege}` or `{ok:false, failure, reason}`.
  - `failure` is one of `refused | timedOut | unreachable | adminProhibited | passwordNotSet | authFailed | localFailure`.
  - Dispatched by `SimServiceLayer.onRequest` to `src/sim/services/remote/RemoteConnectStub.ts`, which agent C replaces.
- **AclMatcher** (`src/net/AclMatcher.ts`, a pure stub; A implements it, C uses it for `access-class`): `decide(list | undefined, AclPacketView) → AclDecision`, where the decision is `match {action, seq}`, `implicitDeny` or `noList`. Also `permits(decision)`.

## 6. CLI hooks

- **Command sets** are registered in `src/cli/commandSets.ts`, in this order: switch, router, `aclCommandSet` (`src/cli/acl`), `natCommandSet` (`src/cli/nat`), `remoteAccessCommandSet` (`src/cli/remote`).
  - `CliRegistry` merges the same top-level keywords (`ip`, `show`, `line`, `interface`-mode `ip`) level by level.
  - Two handlers on one leaf throw at construction.
- **New mode `accessList` {listType, name}:** the prompt is `(config-std-nacl)#` or `(config-ext-nacl)#`, with the help header "Access list configuration commands:". It is in `CONFIG_SUBMODE_KINDS`, so `exit`, `end`, `do` and the global fallback work, as does the MCP sub-mode fallback.
- **Running-config:** reserved slots are `accessLists: 85` and interface line order `features: 50` (`contract/RunningConfig.ts`).
  - NAT global lines go in their own section with a free order number. A free order number is one not used by any other set; pick it from the gaps around `ipGlobal: 50`.
  - Every written line must be accepted by a handler (CLI.md §5.3, a round-trip test), because startup-config replay uses the same parser.
- **Show commands** read `ctx.env.runtime` (a `DeviceRuntime`) and `ctx.env.now`. View classes go in their own files (`*View.ts`).
- **Interactive prompts:** for example `How many bits in the modulus [512]:` uses `CliQuestion`. Always offer the non-interactive form too: MCP types lines one by one and answers questions with Enter.

## 7. Agent A: ACL

**Owns:**
- `src/net/AclMatcher.ts` (+ tests)
- `src/sim/policy/acl/**`
- `src/cli/acl/**`
- `src/features/deviceConfig/sections/acl/**`
- `locales/*/acl.json`
- the ping/tracert "administratively prohibited" output:
  - `src/sim/terminal/ProbeOutcomes.ts`
  - `src/engine/PingFormatter.ts`, `src/engine/TracertFormatter.ts`
- the ACL lines of `PortSecurityModel` and `PortSecurityFields`

**Behaviour:**
- Sequence order, first match wins, implicit deny.
- An empty list permits all (https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-16/sec-data-acl-xe-16-book/sec-create-ip-apply.html).
- Wildcard bits: 0 must match, 1 is ignored. `any`, `host`, and a wildcard of all zeros may be omitted (https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html).
- Sequence numbers (https://www.cisco.com/en/US/docs/ios-xml/ios/sec_data_acl/configuration/15-1mt/Refining_an_IP_Access_List.html):
  - Defaults are 10, 20, …; an entry without a number goes last.
  - `resequence` defaults to 10 10; the maximum is 2147483647.
  - Errors: "Duplicate sequence number." and "Exceeded maximum sequence number.".
  - Sequence numbers are not written to running-config.
- A deny sends ICMP 3/13 (admin prohibited) from the router (https://www.cisco.com/c/en/us/support/docs/security/secure-firewall-asa/225844-understand-icmp-packet-messages.html). It is never sent about ICMP errors or broadcasts (`IcmpResponder.mayReport`).
  - IOS ping shows `U` and traceroute shows `!A`; the `ProbeViews` marks already exist.
  - The Windows text for code 13 is UNVERIFIED. Confirm it before copying a string, or keep "Destination host unreachable."
- Hit counters go in `aclCounters`.

**`show access-lists` format** (https://www.cisco.com/E-Learning/bulk/public/tac/cim/cib/using_cisco_ios_software/cmdrefs/show_access-lists.htm):
- `Extended IP access list 101`, then `    10 permit tcp host … any established (4304 matches)`.
- The `Standard IP access list 10` header is UNVERIFIED.

**Tests:**
- Matcher: wildcard, host/any, tcp/udp ports, `established`, icmp type, implicit deny, order, sequence insert and duplicates.
- Pipeline: in vs out, local vs forwarded, router-originated skips out.
- CLI: golden show output, round trip through `CliShell.replay`, errors, `no` forms.
- A property test that the counters add up.

## 8. Agent B: NAT

**Owns:**
- `src/sim/policy/nat/**`
- `src/cli/nat/**`
- `src/features/deviceConfig/sections/nat/**`
- `locales/*/nat.json`
- the NAT line of `PortSecurityModel` and `PortSecurityFields`

**Config forms** (https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipaddr_nat/configuration/xe-16/nat-xe-16-book/iadnat-addr-conservation.html):
- The NAT ACL lists only the addresses to translate.
- The interface IP must not be in the pool.
- Overload covers ICMP, TCP and UDP only.
- When the pool is exhausted, the packet is dropped with ICMP host unreachable.

**Behaviour:**
- **Timeouts:** lab values ICMP 60 s, UDP 300 s, TCP 86400 s (UNVERIFIED).
- **PAT port choice:** keep the inside port if it is free, else take the next free port in the same class (1-511, 512-1023, 1024-65535). For ICMP the echo identifier plays the port role. UNVERIFIED.
- **Translation:** reverse translation happens in ingress, before the own-address check. NAT notes appear in the inspector.

**Show output** (https://www.cisco.com/en/US/docs/ios-xml/ios/ipaddr_nat/configuration/15-2s/iadnat-monmain.html):
- `show ip nat translations`:
  - Header: `Pro Inside global      Inside local       Outside local      Outside global`.
  - Static/simple row: `--- 192.168.2.1   192.168.2.12   ---   ---`.
  - PAT row: `tcp 192.168.2.20:11012 192.168.2.209:11012 192.168.1.220:23 192.168.2.20:23`.
- `show ip nat statistics`:
  - `Total translations: n (s static, d dynamic; e extended)`
  - `Outside interfaces:` / `Inside interfaces:`
  - `Hits: n  Misses: n`
  - `Expired translations: n`
  - `Dynamic mappings:` / `-- Inside Source` / `access-list 1 pool P refcount n`
  - The pool line.
  - The `[Id:]`, `Peak` and `CEF` lines are UNVERIFIED, so omit them.

**Labs:** need a static WAN address such as 203.0.113.2/30. `Ipv4.isPublic` treats it as public, and the cloud proxy-ARPs it.

**Tests:**
- Static 1:1 in both directions.
- Pool order and exhaustion.
- Interface overload for ping, and for TCP via `HttpClient` to the cloud.
- Port collisions, return traffic, expiry.
- Snapshot/restore.
- Golden show output and a config round trip.

## 9. Agent C: SSH / Telnet / AAA local

**Owns:**
- `src/cli/remote/**`
- `src/sim/services/remote/**`
- `src/sim/terminal/**`, except the ProbeOutcomes lines A owns
- `src/features/deviceConfig/sections/security/**`
- `locales/*/remoteAccess.json`
- edits to `src/cli/core/coreConfigSections.ts`, `src/cli/core/commands/lineCommands.ts` and `src/cli/core/FactoryReset.ts`: `login local`, transport input, access-class line printing, key persistence
- adding `ssh`/`telnet` to the event filter lists (`features/simulation/model/EventFilters.ts`, `preferences/preferencesModel.ts`)

**Required setup** (https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html): hostname, `ip domain name`, `crypto key generate rsa`, `username … secret`, `line vty` / `login local` / `transport input ssh`, `ip ssh version 2`.

**Key generation output:**
- `The name for the keys will be: R1.lab.local`
- `% The key modulus size is 2048 bits`
- `% Generating 2048 bit RSA keys, keys will be non-exportable...`
- `[OK] (elapsed time was 1 seconds)`
- The modulus range is 360–4096.
- The error without a domain, `% Please define a domain-name first.`, is UNVERIFIED.

**`show ip ssh`:** `SSH Enabled - version 2.0` (`1.99` when both versions are allowed), then `Authentication timeout: 120 secs; Authentication retries: 3`.

**Sim:**
- A TCP 22/23 listener in `SimServiceLayer.listens` / `onDatagram`, depending on `transportInput` and the RSA keys.
- Refused → TCP RST.
- Input ACL → admin prohibited.
- vty `access-class` → reset, via `AclMatcher`.
- The client messages are UNVERIFIED: `% Connection refused by remote host`, `% Connection timed out; remote host not responding`.

**Tests:** key prerequisites and prompts, refused vs timeout vs ACL-denied, `login local`, running-config round trip, startup replay, golden `show ip ssh`.

## 10. Agent D: content, QA, docs, cable fix

**Owns:**
- `src/samples/content/**`, `src/scenarios/**`, `src/sim/oracle/**`
- `src/domain/CableRules.ts` + test
- `docs/**` except this file

**Cable fix:** router↔AP must be a straight cable.
- In `CableRules.autoCable`, copper case (about lines 127-129), return `copperStraight` when either end is `accessPoint`. Apply the same exception in `checkPinouts`.
- Do **not** add `accessPoint` to `MDIX_KINDS`.
- Tests: `CableRules.test.ts`, `PortFactory.test.ts`, `LabEditor.property.test.ts`.

**Content:** samples, plus at least one exercise per feature. For example, guest Wi-Fi blocked from staff with an `unreachable` condition, PAT to the internet, and SSH-only management.

**Cross-feature tests:**
- ACL plus NAT on one router (order of operations).
- Serializer and share-link round trip of a full pack 5.2 lab.
- `LabEditor` property tests with features present.
- The oracle skips ACL/NAT labs.

**Docs:**
- PARITY.md rows 62-65.
- CLI.md §5.2, §6, §8.
- SIMULATION.md §9 (row 5.2) and §10.3.
- MODEL_V2.md §8 and §13, including the "no NAT before 5.2" sentence.

## 11. Conflict rules

- **Prelude files** are edited by the coordinator only. Ask for a change instead of editing them:
  - `src/domain/**`, `src/lab/schemas/**`, `src/sim/contract/**`
  - `src/sim/policy/{PacketPolicy,PacketPolicyChain,SecurityPolicies,index}.ts`
  - `src/sim/l3/{PacketReceiver,PacketForwarder,Ipv4NetworkLayer}.ts`
  - `src/cli/contract/**`, `src/cli/commandSets.ts`, `CliPrompt.ts`, `CliHelp.ts`
  - `DeviceSections.ts`, `DeviceConfigPanel.tsx`, `PortEditor.tsx`, `PortEditorModel.ts`
  - `ExerciseLockPolicy.ts`, `i18n/**`, `simulation.json`, `lab.json`, `session.json`
- **mcp/** is owned by the MCP-tools agent. Pack 5.2 agents never edit it. MCP picks up the new commands automatically (`ConsoleSession` uses `CLI_COMMAND_SETS`; host commands go through `SimTerminal`).
- **One namespace per agent.**
- **Show views each in their own file.** No file may exceed 500 lines.
- **Commits:** stage only your own paths, never `git add -A` / `-a`, and say WHAT and WHY.
- **Checks before reporting:** `npm test`, `npm run lint`, `npm run build`, `npm run mcp:typecheck`.
