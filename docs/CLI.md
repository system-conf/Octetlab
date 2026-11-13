# Octetlab — CLI contract (Phase 4)

Contract of wave 4.0 (K4). Binding for C2 (switch commands), C3 (router commands), C4 (host commands +
config views) and the integrator CI. Code: `src/cli/contract/**` (types + constants),
`src/cli/core/**` (parser, help, shell, core commands, running-config), `src/cli/index.ts`.
PLAN.md §1 rules apply. Device output (IOS text) is English and never translated; app hints around it
come from the `cli` namespace (tr + en, informal "sen" in Turkish).

## 1. Principles

- **The device is the running-config.** There is no second copy: `show running-config` is generated
  from the `Device` every time, so GUI edits show up in the CLI at once and CLI edits show up in the GUI.
- **Pure edits.** A handler gets the device and returns a *new* `Device` (`DeviceEdits` helpers); the
  shell never mutates. The UI applies `step.device` to the lab (LabEditor → undo works for CLI edits).
- **Runtime tables are read, never written** by handlers: `env.runtime` is the simulator's
  `DeviceRuntime` (ARP, MAC table, routes, DHCP bindings). Commands that need packets (`ping`,
  `traceroute`, `clear arp`) return a `job` (a `SimRequest`) the UI runs.
- **Declarative commands.** Command sets register keyword trees per mode; the core does abbreviations,
  `?`, Tab, `no`, `do`, errors, paging and history for every command alike.

## 2. Modes

| Mode (`CliMode.kind`) | Prompt | Entered by | `exit` goes to |
|---|---|---|---|
| `userExec` | `R1>` | session start, `disable` | logout ("Press RETURN to get started.") |
| `privilegedExec` | `R1#` | `enable` (asks the enable secret / password if set, 3 tries) | logout |
| `globalConfig` | `R1(config)#` | `configure terminal` (`configure` alone asks `[terminal]`) | `R1#` + `%SYS-5-CONFIG_I` |
| `interface` | `R1(config-if)#` | `interface g0/0`, `interface vlan 10` (creates the SVI) | global config |
| `subInterface` | `R1(config-subif)#` | `interface g0/0.10` (created later by `encapsulation dot1Q`, C3) | global config |
| `interfaceRange` | `S1(config-if-range)#` | `interface range fa0/1 - 12 , g0/1` | global config |
| `line` | `R1(config-line)#` | `line console 0`, `line vty 0 4` | global config |
| `vlan` | `S1(config-vlan)#` | `vlan 10` / `vlan 10,20` (C2 registers the entry command) | global config |
| `dhcpPool` | `R1(dhcp-config)#` | `ip dhcp pool LAN` (C3) | global config |
| `router` | `R1(config-router)#` | reserved for the routing packs 5.3 | global config |
| `accessList` | `R1(config-std-nacl)#` / `R1(config-ext-nacl)#` | `ip access-list standard\|extended NAME` (pack 5.2, `src/cli/acl`); help header "Access list configuration commands:" | global config |
| `objectNetwork` | `Firewall(config-network-object)#` | `object network NAME` on a firewall (firewall pack, `src/cli/firewall`); help header "Network object configuration commands:" | global config |

- `end` and **Ctrl+Z** (`CliShell.control(…, 'ctrlZ')`) from any config mode → `R1#` and
  `%SYS-5-CONFIG_I: Configured from console by console`. Ctrl+C also cancels a question or paging.
- **Sub-mode fallback (IOS):** a line the sub-mode does not know, whose first word is a global config
  command, runs in global config and the session stays in global config (`hostname R2` typed in
  `(config-if)#` → `R2(config)#`). Registering for `globalConfig` is enough; never re-register global
  commands in sub-modes.
- **Interface range:** commands registered for `interface` are also offered in `interfaceRange` and run
  once per member, each with `ctx.mode = { kind: 'interface', interfaceId }`, threading the device. A
  member result with `mode` / `ask` / `job` / `session` stops the loop.
- **`do`:** in every config mode `do <EXEC command>` runs a `privilegedExec` command; mode changes are
  ignored. **`no`:** in config modes `no` offers exactly the nodes that have a `runNo` (in their subtree).
- A mode that points at an interface the GUI removed falls back to global config on the next input.

## 3. Command tree (`src/cli/contract/CliCommandTree.ts`)

### 3.1 Nodes
`CliKeywordNode { kind: 'keyword', word, help, children?, run?, runNo?, when?, hidden? }` and
`CliParamNode { kind: 'param', name, param: CliParamSpec, help, children?, run?, runNo?, when?, hidden? }`.
Build them with `keyword(word, help, options)` / `param(name, spec, help, options)` from `src/cli`.

- `run` executes when the line ends at the node; `runNo` when the line starts with `no` and ends there.
  A node without the needed handler gives `% Incomplete command.`.
- `when(device)` hides a node on devices it does not apply to (`CliWhens.switching`, `.routing`,
  `.routerPlatform`, `.switchPlatform`). Put `when` on the **deepest node that differs**: shared
  top-level words (`show`, `ip`, `interface`, `no`) are merged across sets and must not carry `when` +
  a handler.
- `hidden` nodes parse but are never listed or completed.
- Children arrays may be shared/cyclic (e.g. `ping` options that may follow each other).

### 3.2 Parameters (`CliParamSpec`)
| `type` | Accepts | `?` label | Value (`ctx.args`) |
|---|---|---|---|
| `word` | one token | `WORD` (or `label`) | `text(name)` |
| `number` | integer in `[min, max]` | `<min-max>` | `number(name)` |
| `ipv4` | dotted quad (address or mask; masks checked by the handler, IOS "Bad mask") | `A.B.C.D` | `text(name)` normalized |
| `mac` | `aabb.cc00.0100`, `AA:BB:…`, `aa-bb-…` | `H.H.H` | `text(name)` as `AA:BB:CC:00:01:00` |
| `line` | the raw rest of the line (must be last) | `LINE` | `text(name)` |
| `interface` | `g0/0`, `gi 0/0`, `GigabitEthernet0/0.10`, `vlan 10` — types the device has only | the device's interface types | `interface(name)` → `CliInterfaceName` |
| `interfaceRange` | rest of line: `fa0/1 - 5 , g0/1-2` | interface types | `interfaces(name)` |
| `vlanList` | `10`, `10,20,30-35` (1–4094) | `<1-4094>` | `numbers(name)` sorted, unique |

A keyword always wins over a parameter at the same level; parameters are tried in order.
`CliInterfaceName` is syntax only: resolve it with `DeviceInterfaces.resolve(device, name)` and print
`%Invalid interface type and number` when it is missing. `ctx.path` holds the canonical keywords.

### 3.3 Errors (exact IOS text, each followed by an empty line)
- Invalid: caret line (`' '.repeat(prompt.length + column) + '^'`) and `% Invalid input detected at '^' marker.`
- `% Incomplete command.` · `% Ambiguous command:  "sh i"` (whole typed line).
- A single unknown word in EXEC: `Translating "x"...domain server (255.255.255.255)` (or `Translating "x"`
  after `no ip domain-lookup`) + `% Unknown command or computer name, or unable to find computer address`.
- Handler errors are the handler's own IOS text (`cliError('% …')`), no caret.

### 3.4 Help and completion
- `?` after a space (or alone): next words — parameters first, then keywords alphabetically, then
  `<cr>` when the line is already complete; a mode header (`Exec commands:`, `Configure commands:`,
  `Interface configuration commands:` …) for the top level. `word?`: words starting with it on one line
  (`configure  copy  `), or `% Unrecognized command`. Errors inside the line are reported with a caret.
- Tab completes a unique keyword (plus a space) or an interface type (`interface gi` → `interface
  GigabitEthernet`); otherwise the input stays as it was.

## 4. Session API (the UI calls only this)

```ts
const shell = createCliShell()            // src/cli; core + CLI_COMMAND_SETS, stateless, build once
let step = shell.open(device)              // banner + console password if line con 0 asks for it
step = shell.submit(step.state, device, env, input)   // Enter (command, answer, password, RETURN)
step = shell.help(step.state, device, input)          // '?' pressed; keep step.keepInput in the field
const completed = shell.complete(step.state, device, input)  // Tab
step = shell.pagerKey(step.state, device, 'space' | 'enter' | 'quit')  // at ' --More-- '
step = shell.control(step.state, device, 'ctrlZ' | 'ctrlC')
step = shell.resume(step.state, device, env, record)  // step.job finished (RequestRecord)
shell.history(step.state)                  // Up/Down: history of the mode group, oldest first
shell.runningConfig(device) / shell.showRunningConfig(device)   // Config tab, export
```

- `env: CliEnvironment = { network, runtime, now }`: the lab's `NetworkState`, the device's
  `DeviceRuntime | undefined` (from the simulation snapshot) and the virtual clock in ms.
- `CliStep = { state, lines, device?, job?, prompt, input, keepInput?, reloaded? }`. `lines` never echo the
  input: the UI prints `prompt + input` (help: `prompt + input + '?'`; `secret`: only the prompt).
- `input` tells the UI how to read next: `command` · `secret` (no echo) · `text` (question) · `more`
  (single key → `pagerKey`) · `pressReturn` · `busy` (run `step.job`, then `resume`).
- `CliSessionState` is immutable but holds continuations (questions, jobs): keep it in memory, never in
  the lab. One session per open CLI window; the same device may have several.
- **History:** EXEC and config commands have separate histories of 10 entries (IOS).
- **Pager:** default `terminal length 24` (23 lines + ` --More-- `); `terminal length 0` turns it off.
  Space = next page, Enter = next line, any other key = stop.
- Powered-off device: `cli:poweredOff` message, input `pressReturn`. When the device is powered on again
  or reloaded the UI calls `open` again.

## 5. Management model and config files

### 5.1 Model (`src/domain/ManagementTypes.ts`, `Device.features.management`)
`hostname?`, `enableSecret?`, `enablePassword?`, `passwordEncryption?`, `bannerMotd?`, `domainLookup?`,
`lines?: { console?, vty? }` (`password?`, `login?`, `execTimeout?`, `loggingSynchronous?`),
`startupConfig?`. Every key optional; **absent = IOS factory value**, and handlers store factory values
as absent (so replaying a config reproduces the same object). Passwords are stored as typed (a lab is no
security boundary); running-config shows `password 7 …` (real Cisco type 7) with
`service password-encryption` and `enable secret 5 $1$…` (MD5-crypt look-alike, reversible lab
encoding so `reload` can replay it). All `vty` lines share one settings object; switches print it as
`line vty 0 4` + `line vty 5 15`. The zod schema mirror lives in `src/lab/schemas/deviceSchemas.ts`.

Pack 5.2 (docs/SECURITY_PACK.md §3) adds, all optional: `domainName?` (`ip domain-name` / `ip domain name`),
`users?: LocalUser[]` (`username … [privilege n] secret|password`), `ssh?` (`ip ssh version|time-out|
authentication-retries`, `rsaKeyBits` from `crypto key generate rsa`, kept by `reload`), and on the vty
lines `transportInput?` (absent = all, [] = none), `loginLocal?` and `accessClass?`. Access lists
(`features.accessLists`), NAT (`features.nat`) and the interface keys `l3.features.accessGroups` /
`natRole` live outside `management`; their mirror is `src/lab/schemas/securitySchemas.ts`.

### 5.2 Console access rule
The device's CLI tab is the console line 0 and is always available on a powered device whose model has
the `deviceCli` capability (Packet Tracer behaviour). A PC cabled from its RS232 port to the device's
`Console` port with a console cable opens the same CLI from its Terminal app (C4). `line con 0` with
`login` **and** a password asks "User Access Verification / Password:" (3 tries, `% Bad passwords`);
`login` without a password does not lock the learner out (lab rule).

The vty lines are what Telnet / SSH sessions use (pack 5.2, `src/cli/remote`, `src/sim/services/remote`):
- `transport input ssh|telnet|all|none` decides which TCP port (22 / 23) listens; SSH also needs RSA
  keys (`ip domain name` first, then `crypto key generate rsa`). A closed port refuses the connection.
- `login` with a vty password asks for it; `login` **without** a password refuses the session with
  "Password required, but none set" (the console rule above is unchanged). `login local` checks
  `username` entries.
- `access-class <acl> in` filters by the client's source address; a denied client is reset.
- Clients: `telnet <ip>` and `ssh -l <user> <ip>` from a host's command prompt and from a router (a
  `job`). Scope A: a session ends after connect, authentication and banner with "Open" and the target's
  name, or the failure text; there is no remote prompt yet.

### 5.3 running-config ↔ startup-config ↔ reload
- `startupConfig` = NVRAM text (`!` … `end`). Absent = never saved: `show startup-config` prints
  `startup-config is not present`.
- `copy running-config startup-config` (asks `Destination filename [startup-config]?`), `write memory`,
  `write` → store `shell.runningConfig(device).join('\n')`; output `Building configuration...` `[OK]`.
- `erase startup-config` / `write erase` (asks `[confirm]`) → remove it.
- `copy startup-config running-config` → **merge**: replay the text on the current device.
- `reload`: asks `System configuration has been modified. Save? [yes/no]:` when running ≠ startup, then
  `Proceed with reload? [confirm]`. The device becomes **factory configuration** (`FactoryReset.of`:
  identity, ports and MACs kept, catalog defaults) and, if saved, the startup-config is replayed on it
  with every interface up (running-config writes `shutdown` for each down interface). `step.reloaded`
  tells the UI to restart the device's simulator runtime; the session shows "Press RETURN".
- **Replay** (`shell.replay(device, text)`): every line runs in global config like typed input; `!`
  lines are skipped, `end` stops, errors are ignored, questions take the next lines as answers (multi-line
  banners). This is also the future "paste a config" feature (BACKLOG 8). **Every `run` handler must
  accept the exact lines its running-config contributor writes** (golden round-trip test per set).
- Powering a device off and on in the workspace does **not** reload it (the lab keeps the running
  config; Packet Tracer would lose unsaved changes). Only `reload` uses the startup-config.

## 6. Running-config generator (`src/cli/contract/RunningConfig.ts`)

```
!                     ← body starts here (what startup-config stores)
version 15.1 / 12.2   ← core: version + service lines
!
hostname R1           ← core
!
enable secret 5 …     ← core
!
… sections by RUNNING_CONFIG_ORDER: dhcp 40 (C3) · ipGlobal 50 (core: no ip domain-lookup; C3: ip
  routing / dns; 5.2: ip domain-name) · 52 username (5.2) · 53 ip ssh (5.2) · interfaces 60 ·
  routerProtocols 70 · 75 ip nat pool / ip nat inside source (5.2) · ipRoutes 80 (C2 ip
  default-gateway, C3 ip route) · accessLists 85 (5.2) · banner 90 (core) · lines 100 (core; 5.2 adds
  login local, transport input, access-class)
end
```
- `RunningConfigSection { id, order, blocks(device) }`: each block is followed by `!`; sub-mode lines
  start with one space.
- `InterfaceConfigContributor { id, order, lines(device, iface) }` adds lines (without the leading
  space) to every `interface …` block, by `INTERFACE_LINE_ORDER`: description 10 (core) ·
  encapsulation 15 (C3) · switchport 20 (C2) · ip 30 (C3, also SVIs) · helper 35 (C3) · features 50
  (5.2: `ip access-group`, `ip nat inside|outside`) ·
  physical 80 (core duplex/speed; C3 `clock rate`) · shutdown 90 (core).
- Interfaces are listed by `DeviceInterfaces.list`: ports in device order (routed ports followed by their
  sub-interfaces), then SVIs by VLAN. VLAN definitions are **not** in running-config (vlan.dat, IOS).

## 7. Show-command data sources

| Command | Owner | Source |
|---|---|---|
| `show running-config` / `startup-config` / `history` | core | generator / `management.startupConfig` / session |
| `show vlan brief`, `show interfaces status`, `show interfaces trunk` | C2 | `device.switching`, ports, `LinkStatus.portUp` |
| `show mac address-table` | C2 | `env.runtime.link.macTable` (`expiresAt` vs `env.now`) |
| `show ip interface brief`, `show interfaces` | C2 (switch) / C3 (router) | ports, SVIs, sub-interfaces + `LinkStatus` |
| `show ip route` | C3 | `env.runtime.network.routes`; **hide entries with `exitInterfaceId: null`** (unresolved static) |
| `show arp` / `show ip arp` | C3 (also on switches with SVIs) | `env.runtime.link.arp` (Age = floor((now − updatedAt) / 60000)) |
| `show ip dhcp binding`, `show ip dhcp pool` | C3 | `env.runtime.services` DHCP bindings + `device.services.dhcp` |
| `ping`, `traceroute` | C3 (also switches) | `job: SimRequest` (`ping` / `tracert`), output from the `RequestRecord` |
| `clear arp-cache`, `clear mac address-table dynamic` | C3 / C2 | `job: { kind: 'clearTable', … }` |
| Windows `ipconfig`, `ping`, `tracert`, `nslookup`, `arp`, `netstat`, `hostname` | C4 | `src/engine` formatters + `SimTerminal` |
| `show access-lists`, `show ip access-lists`, `clear access-list counters` | 5.2 ACL | `features.accessLists` + `env.runtime` `aclCounters` (match counts) |
| `show ip nat translations [verbose]`, `show ip nat statistics`, `clear ip nat translation *` | 5.2 NAT | `env.runtime` `natTranslations` (expiry vs `env.now`) / `natStatistics` + `features.nat` |
| `show ip ssh`, `show ssh`, `show users`, `show crypto key mypubkey rsa` | 5.2 remote access | `management.ssh`, `domainName`, the CLI session |
| `telnet`, `ssh -l` (router and host) | 5.2 remote access | `job: { kind: 'remoteConnect', … }` → `RemoteConnectResult` |

Without a running simulation `env.runtime` is `undefined`: tables print empty, `ping` still returns a
job (the UI creates the engine).

## 8. Ownership and fixed APIs

| Agent | Owns | Registers |
|---|---|---|
| K4 / C1 core | `src/cli/core/**`, `src/cli/contract/**`, `src/cli/index.ts`, `src/domain/ManagementTypes.ts`, `cli` ns | modes, `enable`/`disable`/`configure`/`exit`/`end`/`logout`, `show running-config`/`startup-config`/`history`, `copy`, `write`, `erase`, `reload`, `terminal length`, `hostname`, `enable secret/password`, `service password-encryption`, `ip domain-lookup`, `banner motd`, `line console/vty` + `password`/`login`/`exec-timeout`/`logging synchronous`, `interface`/`interface range` (+ SVI creation), `description`, `shutdown`, `speed`, `duplex` |
| C2 switch | `src/cli/switch/**` | exports `switchCommandSet: CliCommandSet` — `vlan` (+ vlan mode `name`), `switchport …`, `no switchport` (L3 switch), `ip default-gateway`, SVI `ip address`, `show vlan …`, `show interfaces status/trunk`, `show mac address-table`, `clear mac address-table` |
| C3 router | `src/cli/router/**` | exports `routerCommandSet` — `ip address`, `encapsulation dot1Q` (creates the sub-interface: `DeviceEdits.updateSubInterface(…, create)`), `ip route`, `ip routing`, `ip dhcp pool/excluded-address` (+ dhcp mode), `ip helper-address`, `clock rate`, `show ip interface brief`, `show ip route`, `show arp`, `show ip dhcp binding`, `ping`, `traceroute` |
| C4 host + views | `src/cli/host/**`, `src/features/device/config/**` | Windows commands; Config tab (running/startup text via `shell.runningConfig`), lab-wide export |
| CI integrator | `src/cli/commandSets.ts`, UI wiring | adds `switchCommandSet`, `routerCommandSet` to `CLI_COMMAND_SETS` |
| Pack 5.2 A (ACL) | `src/cli/acl/**` | `aclCommandSet` — `access-list`, `ip access-list standard\|extended` (+ `accessList` mode, sequence numbers, `remark`), `ip access-list resequence`, `ip access-group in\|out`, `show (ip) access-lists`, `clear access-list counters` |
| Pack 5.2 B (NAT) | `src/cli/nat/**` | `natCommandSet` — `ip nat pool`, `ip nat inside source static\|list …`, `ip nat inside\|outside`, `show ip nat translations\|statistics`, `clear ip nat translation *` |
| Pack 5.2 C (remote access) | `src/cli/remote/**` (+ core line commands) | `remoteAccessCommandSet` — `ip domain-name`, `username`, `crypto key generate\|zeroize rsa`, `ip ssh …`, vty `transport input` / `login local` / `access-class`, `show ip ssh` / `ssh` / `users` / `crypto key mypubkey rsa`, `telnet`, `ssh` |

| Firewall pack B | `src/cli/firewall/**` | `firewallCommandSet` (set id `firewall`) — see "Firewall flavour" below |

`CLI_COMMAND_SETS` order since pack 5.2: switch, router, ACL, NAT, remote access (docs/SECURITY_PACK.md §6);
the firewall pack adds the `firewall` set.

### Firewall flavour (firewall pack, docs/FIREWALL_PACK.md §6)

A device of kind `firewall` speaks the well-known firewall-appliance syntax (no vendor name in the UI). Every
firewall command is registered with `when: device.kind === 'firewall'`; router commands are not hidden.
- Prompt and hostname: `Firewall` by default (`CliPrompt.factoryHostname`), modes as on a router plus
  `objectNetwork`.
- Interface: `nameif <name>` (the name `inside` brings level 100 when no level is set), `security-level
  <0-100>`, both with `no`; `ip address` is the router command.
- Global: `same-security-traffic permit inter-interface|intra-interface`, `access-list <name> extended …`
  (masks instead of wildcards), `access-group <acl> in|out interface <nameif>`, `object network <name>` →
  `host` / `subnet` / `nat (<real>,<mapped>) static <ip>|dynamic interface` (mapped onto the pack 5.2 NAT
  rows; a dynamic object gets a generated list `OBJ_NAT_<object>`), `timeout conn|half-closed|udp|icmp
  <h:mm:ss>`, `inspect icmp` (simplified, no policy map), `route <nameif> <net> <mask> <gateway>`.
- EXEC: `show conn [count|detail|all]`, `show nameif`, `show xlate`, `show route`, `show interface ip brief`,
  `clear conn`, `clear xlate`, and a configuration explainer that prints the checked phases (route lookup,
  access list, NAT, level check) with ALLOW / DROP; it sends no packet (D5).
- Running-config: interface slot 55 (`nameif`, then `security-level`), global slot 76
  (`same-security-traffic`, `object network` blocks, `access-group`, `timeout`).

Fixed for wave 4.1 (change only through the coordinator): everything exported from
`src/cli/contract`, `CliShell`'s public methods, `keyword` / `param` / `CliWhens`, `DeviceEdits`,
`DeviceInterfaces`, `InterfaceNames`, `LinkStatus`, `cliText` / `cliError` / `cliLog` / `cliMessage`,
`ManagementSettings`. Rules for command sets:
1. Test with `new CliShell([yourSet])` (see `src/cli/core/testCli.ts` `CliDriver`); golden tests per command.
2. One `run` per merged node: two sets must not both handle the same path (the registry throws).
3. Interface commands must work for every member of a range (read `ctx.mode.interfaceId`).
4. Each config line your contributor writes must replay to the same device (round-trip test).
5. Handlers never throw for user input: print the IOS error. Throw only for programmer errors.
