# Octetlab — packet simulation (Phase 3)

Contract of Phase 3 (wave 3.0, K3). Binding for S1, S2, S3, U3 (wave 3.1), I3 and O3 (wave 3.2) and
read by the Phase 4 CLI. Code: `src/sim/contract/**` (types + three pure helpers), `src/sim/core/**`
(the kernel, implemented and tested in 3.0), `src/sim/index.ts`. Namespace `simulation`.
PLAN.md §1 rules apply (strict TS, no `any`, < 500 lines, classes for logic, no kebab-case).

## 1. Principles

- **Configuration vs runtime.** The lab's `NetworkState` is what the user configured. What devices learn
  while running (ARP, MAC tables, leases, sessions) is `DeviceRuntime`, kept by the simulator only.
  The simulator never mutates `NetworkState`; the one exception (DHCP writes addresses, as the rule
  engine does) is an explicit `StateEffect` (§5.4).
- **Plain data.** PDUs, events, runtime and snapshots are immutable, JSON-serializable objects (no Maps,
  no class instances): they cross a Web Worker boundary and are kept for step-back.
- **Deterministic.** Same network + options + calls → same events, byte for byte (§3.3).
- **The kernel knows no protocol.** `src/sim/core` queues tasks and hands them to three stateless
  layers (S1 link, S2 network, S3 services) through a `DeviceContext`. All networking lives in layers.
- **Parity first.** The simulator reproduces the rule engine (`src/engine`) at packet level; where the
  engine encoded a lab rule (WAN down = silence, private addresses never go to the internet, both
  NICs of a duplicate address lose it) the simulator implements the same rule. Where the engine
  simplified and real behaviour differs, the simulator is realistic and the oracle lists the case (§10.3).
- **Engine helpers, not engine decisions.** Layers may import the configuration readers of
  `src/engine`: `Ipv4`, `Topology`, `L3Interfaces`, `VlanRules`, `HostAttachment`, `RoutingTable.isUp`,
  `DeviceAddresses`, `DhcpPoolAllocator`, `DnsQuery.normalize`, `internetHosts`. They must **not** import
  the decision classes the oracle compares against: `ReachabilityChecker`, `RouterForwarder`,
  `SegmentFinder`, `RoutingTable.lookup`, `DhcpService`, `DnsResolver`, `ProbeReporter`, `AppLinkChecker`.

| File (`src/sim/contract`) | Content |
|---|---|
| `Pdu.ts` | PDU headers: Ethernet, 802.1Q, HDLC, ARP, IPv4, ICMP, UDP, TCP, DHCP, DNS, HTTP |
| `ReservedPdus.ts` | `never` aliases for pack PDUs (§9) |
| `PduLayers.ts` | class: derived numbers, top-most protocol, ICMP quote, inspector field view |
| `SimEvent.ts` | `SimEvent`, `SimAction`, `SimNote`, `PduIds`, `SimTransmission`, `SimProtocol`, `OsiLayer` |
| `SimReason.ts` | `SIM_REASONS` / `SimReason` (drop and decision codes) |
| `LinkLayerState.ts`, `NetworkLayerState.ts`, `ServiceLayerState.ts` | runtime slice + timers per layer (owner-extensible, §4) |
| `Runtime.ts` | `DeviceRuntime`, `RuntimeExtensions`, `SimTimer` |
| `Requests.ts` | `SimRequest`, `RequestRecord`, results, `StateEffect` |
| `Layers.ts` | `DeviceContext`, `EventBuilder`, `LinkLayer`, `NetworkLayer`, `ServiceLayer`, hand-over types |
| `SimulationEngine.ts` | `SimulationEngine`, `SimSnapshot`, `SimTask`, `SimOptions`, step / run results |
| `SimulationView.ts` | UI contract (§8) |
| `DeviceProfiles.ts` | class: what a device does (§6.2) |
| `SimConstants.ts` | `SIM_TIMING`, `SIM_TTL`, `SIM_PORTS`, `SIM_LIMITS` |
| `SimMessages.ts` | compile-checked `simulation:` keys for actions, reasons, protocols, layers, fields |

## 2. PDUs

`Pdu = WireFrame | Ipv4Packet`; `WireFrame = EthernetFrame | HdlcFrame` (+ reserved `PppFrame`).

| Layer | Type | Fields |
|---|---|---|
| 2 | `EthernetFrame` | `src`, `dst` (MAC), `tag?: Dot1QTag { vid, pcp }`, `payload: ArpPacket \| Ipv4Packet` (Wi-Fi uses it too) |
| 2 | `HdlcFrame` | `payload: Ipv4Packet` (serial links: no MAC, no ARP) |
| 2½ | `ArpPacket` | `operation`, `senderMac/Ip`, `targetMac/Ip`. Probe: sender IP `0.0.0.0`; request target MAC `ZERO_MAC` |
| 3 | `Ipv4Packet` | `src`, `dst`, `ttl`, `identification`, `payload` (no options, never fragmented) |
| 3 | `IcmpEcho` | `type: echoRequest \| echoReply`, `identifier`, `sequence`, `dataBytes` |
| 3 | `IcmpDestinationUnreachable` / `IcmpTimeExceeded` | `code` (`net, host, protocol, port, adminProhibited` / `ttlInTransit`), `original: IpQuote` |
| 4 | `UdpDatagram` / `TcpSegment` | ports; TCP `flags: TcpFlag[]` (syn, ack, fin, rst, psh), `seq?`, `ack?` |
| 7 | `DhcpMessage` | `messageType` (discover … inform), `transactionId`, `clientMac`, `clientIp/yourIp/serverIp/relayIp`, `broadcast`, `options` |
| 7 | `DnsMessage` | `id`, `response`, `recursionDesired/Available`, `authoritative`, `responseCode`, `questions`, `answers` (A) |
| 7 | `HttpMessage` | request `GET host path` / response `status`, `contentBytes` |

Derived, never stored (cannot disagree with the payload): EtherType (`PduLayers.etherType`), IP protocol
number, ICMP type/code numbers, BOOTP op, the top-most protocol (`PduLayers.protocolOf`). The inspector
view `PduLayers.describe(pdu)` returns bottom-up `PduLayerView { layer, protocol, fields: { field, value }[] }`:
labels are `simulation:fields.<field>`, values stay protocol notation (`0x0800 (IPv4)`, `8 (Echo request)`).
`PduLayers.quote(packet)` builds the `IpQuote` an ICMP error carries (clients match errors with it).

## 3. Events and the timeline

### 3.1 `SimEvent`
`{ id, time, seq, deviceId, lastDeviceId?, inPortId?, outPortIds[], flowId, pduId | null, frameId | null,
protocol | null, inbound: Pdu | null, outbound: Pdu | null, action, layer: OsiLayer, reason?, notes: SimNote[],
causeEventId? }`. `SimNote { layer, direction: 'in' | 'out', message: LocalizedMessage }` is one line of the
OSI explanation (keys `simulation:notes.*`). `SimTransmission { id, eventId, linkId, from, to, departAt,
arriveAt, flowId, pduId, frameId, frame, protocol }` is a frame on a link (one per link: a flood makes
several, each with its own 802.1Q tagging).

**One event per device per PDU.** When a frame arrives, the kernel opens the arrival's builder; the
layers it passes through add notes to that same builder, and the layer that finishes the PDU concludes it.
PDUs a device creates (an ARP request, a reply, an ICMP error) get their own `created` event with
`causeEventId`.

### 3.2 Actions and identities
| Action | Meaning |
|---|---|
| `created` | originated here (sent when `outPortIds` is not empty) |
| `buffered` | held here (IPv4 waiting for ARP); also a created packet that must wait |
| `sent` | a held PDU leaves now (`causeEventId` = the buffering event) |
| `forwarded` | sent out of exactly one port; `layer` 2 = switched, 3 = routed |
| `flooded` | sent out of several ports (broadcast, unknown unicast, hub at layer 1) |
| `filtered` | bridge filtering (destination on the ingress port); not an error |
| `delivered` | consumed (ARP cache, upper layer, application) |
| `replied` | consumed and answered; the answer is a separate `created` event |
| `dropped` / `timedOut` | problem / client gave up; `reason` required (`timedOut` has no PDU) |

`PduIds`: `flowId` = the request id (`r3`) for everything a request causes (ARP, replies, errors),
`boot` for start-up traffic, `bg:<deviceId>` for spontaneous traffic. `pduId` = the logical packet; kept by
switches and routers (re-encapsulation keeps the IP packet), new for every reply. `frameId` = one frame
instance; flood copies share it; routers, released buffers and new PDUs get a new one.

`SimReason` (`SIM_REASONS`): kernel `linkDown, noLink, powerOff`; L2 `notForThisInterface, sameSegment,
vlanNotAllowed, vlanInactive, noSubInterface, l2Loop, arpTimeout, arpNotForUs, unknownSsid,
ispServiceDown, ispNoService`; L3 (same names as `FailureReason` where equal) `cableDisconnected,
portDisabled, noIpAddress, invalidConfig, invalidHostAddress, ipConflict, gatewayNotSet,
gatewayOutsideSubnet, ttlExpired, noRoute, notRouting, privateToInternet, ispNoRoute, portUnreachable,
protocolUnreachable, noIcmpAboutIcmpError`; services `dhcpServiceDisabled, dhcpNoPool, dhcpPoolExhausted,
dhcpNotForThisClient, dhcpNak, dnsServiceDisabled, dnsLoop, dnsNotAResolver, connectionRefused`;
clients `requestTimedOut, staleReply, unsupported`. Frozen for wave 3.1: a missing code is reported to
the coordinator (use the closest code plus a note meanwhile).

### 3.3 Determinism rules
1. Time is virtual milliseconds from engine creation; it only moves when a task is taken from the queue
   or `runUntil(t)` is called. Nothing in `src/sim/**` reads the wall clock or calls `Math.random`,
   timers or animation frames (`src/sim/DeterminismGuard.test.ts` fails otherwise).
2. The queue is ordered by `(time, seq)`; `seq` is a global counter given when a task is queued. Frames
   sent in one call arrive in send order.
3. Randomness only through `ctx.random()` (mulberry32, state in the snapshot): DHCP xid, DNS id, TCP ISN.
   Counters, not randomness, for IP identification, ICMP identifiers and ephemeral ports.
4. Iterate configuration in its own order (`device.ports`, `state.devices`, `state.links`), never over
   object keys of runtime records when the order matters.
5. Timers are never cancelled; a timer that finds nothing to do is a no-op.

### 3.4 Latency and timing (`SIM_TIMING`, `SIM_TTL`)
Only links take time: wired (copper, fiber, coaxial) 1 ms, wireless 2 ms, serial 2 ms; devices decide in
0 ms (`DefaultLatencyModel`, replaceable through `SimOptions.latency`). Equal wired latencies keep packets
in step, so one `'instant'` step moves every packet one hop. Virtual time drives ordering, aging and
timeouts; printed ping / tracert times are derived from the hop count like today (§10.1), not measured.

| Timer | Value | Note |
|---|---|---|
| ARP | 3 requests, 1000 ms apart, then waiting packets dropped; at most 4 packets wait per next hop, a further one is dropped (`arpQueueFull`, §5.6) | 3 s < ping timeout, so routers report unreachable in time |
| ARP aging | hosts 120 s, routers / switches 4 h | lazy (`expiresAt`) |
| MAC aging | 300 s | lazy |
| ping / tracert | 4000 ms timeout, next echo 1000 ms after a reply / failure, at once after a timeout | Windows |
| DNS | client 2000 ms per server; a server 500 ms per forwarder; public answers TTL 300 s | |
| DHCP | 3 tries, 2000 ms apart; lease 86 400 s | lab values |
| HTTP | 5000 ms | |
| L2 loop guard | a bridge remembers forwarded frame ids for 1000 ms | |
| TTL | hosts / switches 128, routers 255, internet replies 118 (117 behind one router) | |

## 4. Runtime state

`DeviceRuntime { deviceId, link: LinkRuntime, network: NetworkRuntime, services: ServiceRuntime, extensions? }`,
one slice per layer, each written only by its owner. Created empty by `RuntimeTables.empty(id)` when a
device starts, discarded when it stops.

| Slice | Field | Read by | Shape |
|---|---|---|---|
| link (S1) | `arp` | CLI `show ip arp`, `arp -a` | `ArpEntry { interfaceId, ip, mac \| null, state: incomplete \| reachable, type: dynamic \| static, updatedAt, expiresAt \| null, attempts }` |
| | `macTable` | `show mac address-table` | `MacTableEntry { vlan, mac, portId, type, learnedAt, expiresAt \| null }` |
| | `pending` | — | `PendingPacket { interfaceId, nextHopIp, packet, ids, bufferedEventId, queuedAt, ingressInterfaceId? }`, ≤ `SIM_LIMITS.arpPendingPerNextHop` per next hop |
| | `claims` | S2 (`ipConflict`), `ipconfig` | `AddressClaim { interfaceId, address, duplicate, probedAt }` |
| | `seenFrames` | — | loop guard `{ frameId, at }` |
| network (S2) | `routes` | `show ip route`, `route print` | `RouteEntry { code: connected \| local \| static, prefix, mask, prefixLength, adminDistance, metric, nextHop \| null, exitInterfaceId \| null }` |
| | `sessions` | — | `PingSession`, `TracertSession` |
| | `ipIdentification`, `echoIdentifier` | — | counters |
| services (S3) | `dhcpBindings` | `show ip dhcp binding` | `DhcpBinding { poolId, ip, mac, state: offered \| bound, transactionId, leaseStart, leaseExpires \| null }` |
| | `dhcpClients` | `ipconfig /all` | `DhcpClientLease { portId, phase, transactionId, requestId, attempts, offeredIp?, serverIp?, leaseObtainedAt?, leaseExpiresAt? }` |
| | `dnsCache` | `ipconfig /displaydns` | `DnsCacheEntry { name, address \| null, expiresAt }` |
| | `sessions`, `nextEphemeralPort` | — | `DnsClientSession`, `DnsForwardSession`, `HttpClientSession` |

- **Aging is lazy**: an entry with `expiresAt <= now` does not exist (`RuntimeTables.arp/macTable/dnsCache(runtime, now)`);
  layers prune when they write. Protocol timers are queued tasks (`SimTimer = LinkTimer | NetworkTimer | ServiceTimer`).
- **Owner-extensible files**: during wave 3.1 S1 / S2 / S3 may **add** optional fields, session and timer
  members in their own `*LayerState.ts`. Fields marked CLI above are frozen.
- The routing table is derived from configuration (S2 rebuilds it on start and every `DeviceChange`), so
  forwarding and `show ip route` always agree. Dynamic protocols add `RouteCode` members (pack 5.3).
- The live configuration for the CLI is `engine.network()`; runtime for a device `engine.runtime(id)`,
  current time `engine.time` (ages = `time - updatedAt`).

## 5. `SimulationEngine`

`SimulationKernel.create(network, layers, options?)` (`src/sim/core`) implements it:

| Member | Semantics |
|---|---|
| `create` | starts every powered device (`onStart` per layer). `settle` (default true) runs the start-up traffic (duplicate-address probes) to idle — within its budget (§5.6) — and clears the logs: the user starts from a quiet, warmed-up network (switches may already know host MACs; ARP caches are empty). Options: `seed` (1), `latency`, `maxRetainedEvents` (50 000), `settleBudget { tasks?, timeMs? }` |
| `settleTruncated` | true when `create` stopped settling at the budget (§5.6): the rest of the start-up traffic is still queued |
| `inject(request, delayMs = 0)` | queues a request task, returns `r<n>` (= flow id); unknown device = throw |
| `step(granularity = 'instant')` | `'instant'`: every task at the next point in time; `'task'`: one task. Returns `{ time, events, transmissions, processedTasks, idle }` |
| `runUntilIdle(limit)`, `runUntil(time, limit)`, `runUntilDone(requestId, limit)` | `stoppedBy: idle \| limit \| time \| requestDone`; default limit 100 000 tasks. `runUntil` moves the clock to `time` (realtime) |
| `snapshot()` / `restore(s)` | `SimSnapshot { network, time, counters, rngState, queue, devices, requests }`; logs are append-only beside it and truncated on restore, so step-back = keep snapshots, restore one. Built on demand from the live state and reused (same object) until the state changes |
| `events(fromId)`, `transmissions(fromId)` | retained logs (the newest `maxRetainedEvents`, §5.6) |
| `request(id)`, `requests()` | `RequestRecord { id, request, status: queued \| running \| done, queuedAt, finishedAt, result, aborted? }` |
| `reconfigure(next)` | the user edited the lab (§5.3); returns `{ changedDevices, startedDevices, stoppedDevices, abortedRequests, events }` |
| `network()`, `runtime(id)`, `time`, `isIdle()`, `nextTaskTime()` | reads |

### 5.1 Requests (`SimRequest`)
`ping { deviceId, targetIp, count, size, ttl? }` (simple PDU = `count: 1`), `tracert { targetIp, maxHops 30,
probesPerHop 3, maxSilentHops 4 }`, `dhcpRenew { portId? }`, `dhcpRelease { portId? }`,
`dnsQuery { name, servers?, useCache? }`, `httpGet { serverIp, host, path }`, `clearTable { table: arp | mac | dnsCache }`.
Names are resolved by the caller: I3 injects `dnsQuery`, then `ping` with the answer.

### 5.2 Results
The client on the source device reports through `ctx.report(requestId, result, done)` when it consumes an
answer or gives up, so every result has events behind it (`delivered` reply, `timedOut`…). Reports after
`done` are ignored. `PingResult { echoes: EchoResult[], stats: PingStats }` with `reply { fromIp, ttl, bytes, rttMs }`,
`unreachable { fromIp, code }`, `ttlExpired { fromIp }`, `timeout`, `localFailure { reason }` (each with
`sequence` and `requestPduId`); `echoes` holds the latest `SIM_LIMITS.echoResultsKept` results,
`PingStats { results, replies, errors, timeouts, localFailures, minRttMs, maxRttMs, totalRttMs }` counts
all of them (`PingTally`, §5.6). `TracertResult { hops: { ttl, probes }[], ending: reached | unreachable
{ reporterIp, code } | silent | hopLimit | localFailure }`. `DhcpResult { operation, adapters: per NIC ok
{ ip, mask, gateway, dnsServers, serverIp } | released | failure, effects }`. `DnsResult { name, answer:
ResolveResult }` (the engine's own type). `HttpResult`, `ClearResult`.

### 5.3 Reconfigure: what survives
`DeviceChanges.between(old, new)` decides; then one scope at the current time runs the hooks.

| Change | Effect |
|---|---|
| device removed / powered off | runtime discarded; its unfinished requests end `aborted: deviceRemoved \| deviceOff`; its timers become no-ops |
| device added / powered on | fresh runtime, `onStart` (probes, routes) |
| config of a running device changed, or a port's link started / stopped carrying traffic (also because of the far end) | `onChange(ctx, { previous, configChanged, portsDown, portsUp })` for link, network, services |
| frames in flight on a link that went down | dropped on arrival at the far end (`linkDown`) |
| anything else | survives (ARP / MAC entries elsewhere may now be stale, as in real networks) |

Required flush rules: S1 — port down: MAC entries learned on it, ARP entries and pending packets of the
L3 interfaces on it; switchport VLAN settings changed: MAC entries of that port; VLAN removed: its MAC
entries; address or mask of an interface changed: its ARP entries, and a new probe (§7.1). S2 — routes
rebuilt on every change; sessions survive. S3 — a NIC switched to static drops its client lease; removed
pools drop their bindings; changed host DNS servers flush the DNS cache.

### 5.4 Configuration effects
`StateEffect = dhcpLeaseBound { clientId, portId, mac, ip, mask, gateway, dnsServers, serverId, poolId } |
dhcpLeaseReleased { clientId, portId }`. A layer calls `ctx.applyEffect`; after the task the kernel applies
it with `services.applyEffect(network, effect)` (S3; exactly the rule engine's `DhcpService` rules: NIC
address in `dhcp` mode, host gateway / DNS with "a static NIC wins", one lease record per MAC; release
clears gateway / DNS only when no other NIC keeps an address, the server keeps the lease record) and runs
the change hooks. The result lists the effects; the session (I3) applies the same effects to the lab
document, so document and engine stay equal and the next `reconfigure` is a no-op for them.

### 5.5 Realtime and simulation mode
- **Realtime**: the UI maps wall time to virtual time 1:1 and calls `runUntil(virtualNow)` each frame.
  Terminal commands run instantly: inject, `runUntilDone(id)`, print (the clock jumps ahead, which only
  ages tables earlier). Transmissions of that run feed the map animation (§8).
- **Simulation**: the clock moves only by `step()` / play. Requests from the terminal or the simple PDU
  tool are queued at `now`; the terminal prints when the record is `done`. Step back = `restore` of the
  previous snapshot (U3 keeps a bounded stack). Switching to realtime runs the queue to idle at once;
  switching to simulation keeps the runtime.
- The engine has no DOM dependency and may run in a Web Worker (I3/U3 decision); snapshots, events and
  requests are structured-clone safe.

### 5.6 Limits and cost (`SIM_LIMITS`)
Everything the engine keeps or does per call is bounded; all bounds are deterministic (counts of tasks,
records and virtual time, never wall time).

| Limit | Value | What happens past it |
|---|---|---|
| `taskLimit` | 100 000 tasks per `runUntil*` call (argument) | `stoppedBy: 'limit'`; the queue stays as it is |
| `settleTaskLimit`, `settleTimeMs` | 400 000 tasks, tasks up to 60 000 ms of virtual time (`SimOptions.settleBudget`) | `create` stops settling: the rest stays queued and runs with the next steps (in realtime with the next `runUntil`), `onSettled` still runs, the logs are cleared, `engine.settleTruncated` is true so the UI can say the start-up traffic was cut short |
| `maxRetainedEvents` | 50 000 events and 50 000 transmissions | the oldest are forgotten; the log is trimmed in batches (at 1.5× the limit) so appending stays O(1); `events()` / `transmissions()` never return more than the limit |
| `arpPendingPerNextHop` | 4 packets per unresolved next hop | the new packet is dropped at once (`dropped`, layer 2, `arpQueueFull`, note `l2.arpQueueFull`); no ICMP error and no `onUndeliverable` — like a full queue on a real device the sender only sees a timeout. Real stacks: IOS holds one packet, Linux a short queue |
| `echoResultsKept` | 100 echo results per ping record and session | the oldest results leave `PingResult.echoes`; `PingResult.stats` keeps counting, so the statistics of a ping with `count` 1e9 stay right. ≥ the terminal's `PingOptions.maxCount` (20), so terminal output always sees every echo |

Cost per task. A flat segment of n hosts needs about n² settle tasks (every host's duplicate-address probe
reaches every host: 38 000 tasks at 200 devices, 240 000 at 500, 375 000 at 625), so the cost of one task
must not grow with the lab:

- the live state is mutable (`KernelState`); a task works on a `TaskScope` overlay of the runtimes and
  requests it touches, and the kernel applies only that overlay after the task (a layer that throws
  leaves the state as before the task);
- the queue is a binary heap (`TaskHeap`, same (time, seq) order as the sorted snapshot queue);
- `snapshot()` copies the device and request tables and sorts the queue only when asked, and returns the
  same object until the state changes (SimulationPlayer compares identities);
- links are found through `Topology` (per port), never by scanning `network.links`;
- per-device tables that legitimately grow with the segment (a core switch's MAC table, the L2 loop
  guard's recent frame ids) are read and rebuilt in one pass.

Measured (node 24, dev machine, flat labs `src/sim/perf/flatTestLab.ts`): settle of 200 devices 0.18–0.25
s (was 9 s), 500 devices 0.9–1.7 s (did not finish before), 3.5–7 µs per task at every size. Guarded by
`src/sim/perf/SettlePerf.test.ts` (fastest run: 200 devices < 2.5 s, 500 devices < 15 s — headroom for the
parallel test run, which was up to 5x slower; the targets 1 s / 5 s hold standalone). Duplicate-address
probes are not coalesced: every host really receives every probe, and the event list shows them.

## 6. Device plug-in contract

### 6.1 Kernel, context, builders
Tasks: `arrival` (a frame reaches a port), `timer`, `request`. The kernel dispatches:
arrival → `link.onFrame` (after checking the link is still up and still joins that port; else `dropped
linkDown` at layer 1); timer → the layer named in `timer.layer`; request → `network.onRequest` (ping,
tracert), `link.onRequest` (`clearTable` arp / mac), `services.onRequest` (the rest). Hooks
`onStart` / `onChange` run link, network, services in that order per device, devices in state order.

`DeviceContext` (one device, one task): `now, device, network, topology, runtime, layers,
updateRuntime(fn), random(), arrival, openEvent({ flowId, ids?, protocol?, causeEventId? }), newPdu(flowId),
newFrameId(), schedule(delayMs, timer), report(requestId, result, done), applyEffect(effect)`. A context
changes only its own device; other devices are reached through frames.

`EventBuilder`: `id, flowId, pduId, frameId, note(layer, direction, message), transmit({ portId, linkId? },
frame, frameId?) → boolean, setOutbound(pdu), conclude(action, layer, reason?)`. `transmit` is layer 1: it
needs a link that carries traffic (else returns false, adds `notes.l1.linkDown`, sends nothing); ports
with several links (radio) must name the link. Every builder must be concluded exactly once (last call
wins); an unconcluded builder throws when the task commits (programmer error).

### 6.2 `DeviceProfile` (`DeviceProfiles.of(device)`)
`{ repeater (hub), bridge (has switched or radio ports), ipRole: router (routing.ipRouting) | host (NICs,
routed ports without ip routing, SVIs) | none, isp (cloud), dhcpServer, dnsServer }`. Layers compose their
handlers from it: S1 hub repeater / bridge / NIC endpoint / ARP / cloud port; S2 host stack / router /
ISP; S3 DHCP server, client, relay / DNS server, forwarder, client, public resolvers / HTTP.
An L3 switch is bridge + router (SVIs are endpoints of its bridge), a wireless router is bridge + router +
DHCP, a switch with a management SVI is bridge + host.

### 6.3 Layer interfaces (`Layers.ts`)
```ts
interface LayerLifecycle { onStart(ctx): void; onChange(ctx, change: DeviceChange): void }
interface LinkLayer extends LayerLifecycle {          // S1
  onFrame(ctx, arrival: FrameArrival): void
  send(ctx, request: LinkSend): void                  // resolve, buffer, encapsulate, transmit; concludes request.event
  onTimer(ctx, timer: LinkTimer): void
  onRequest(ctx, requestId, request): void            // clearTable arp | mac
  interfaceReady(ctx, interfaceId): Ipv4SendResult    // link up, address not duplicate
}
interface NetworkLayer extends LayerLifecycle {       // S2
  onPacket(ctx, delivery: Ipv4Delivery): void         // concludes delivery.event (or passes it to services)
  send(ctx, request: Ipv4Send): Ipv4SendResult        // originate; logs created / dropped
  onUndeliverable(ctx, failure: Undeliverable): void  // ARP failed: ICMP host unreachable or local report
  onTimer(ctx, timer: NetworkTimer): void
  onRequest(ctx, requestId, request): void            // ping, tracert
}
interface ServiceLayer extends LayerLifecycle {       // S3
  listens(ctx, protocol: 'udp' | 'tcp', dstIp, dstPort): boolean
  onDatagram(ctx, delivery: TransportDelivery): void
  onIcmpError(ctx, report: IcmpErrorReport): void
  onTimer(ctx, timer: ServiceTimer): void
  onRequest(ctx, requestId, request): void            // dhcpRenew, dhcpRelease, dnsQuery, httpGet, clearTable dnsCache
  applyEffect(state: NetworkState, effect: StateEffect): NetworkState   // pure
}
interface SimLayers { link: LinkLayer; network: NetworkLayer; services: ServiceLayer }
```
Hand-over types: `FrameArrival { portId, linkId, fromDeviceId, fromPortId, frame, ids }`;
`LinkSend { interfaceId, nextHopIp, packet, ids, linkDestination?, event, ingressInterfaceId? }`;
`Ipv4Delivery { interfaceId, inPortId, packet, ids, linkSourceMac, linkBroadcast, event }`;
`Undeliverable { interfaceId, nextHopIp, packet, ids, reason, droppedEventId, ingressInterfaceId? }`;
`Ipv4Send { ids, dst, src?, ttl?, payload, egressInterfaceId?, linkDestination?, causeEventId? }` →
`Ipv4SendResult { ok: true, src, interfaceId } | { ok: false, reason }`; `TransportDelivery`;
`IcmpErrorReport { reporterIp, error, local, event }`. `LinkDestination = broadcast | { mac }` skips ARP.
Interface ids are the engine's L3 interface ids (port, `Gi0/0.10`, `Vlan10`); the cloud uses its port id.

Call graph of a ping across a switch and a router (one builder per device and PDU):
`network.onRequest` (pc) → `network.send` → `link.send` (ARP hit → transmit, concludes `created`; miss →
`buffered` + ARP request `created`) → switch `link.onFrame` (learn, forward / flood) → router
`link.onFrame` (accept, de-tag) → `network.onPacket` (route, TTL) → `link.send` (concludes `forwarded`
layer 3) → … → destination `network.onPacket` → echo reply via `network.send` (event `replied` + `created`).

## 7. Behaviour rules (binding for S1–S3)

### 7.1 Link layer (S1)
- Hub: repeats the frame (tag included) out of every other port whose link is up; action `flooded`, layer 1.
- Bridge: ingress / egress VLAN by `VlanRules` (access, trunk, native, allowed ∩ database); radio side:
  frames from a client belong to the SSID's VLAN (untagged only), frames to clients go per associated
  link (`linkId`) of that VLAN, unicast only to the client whose NIC MAC matches; learn `(vlan, src, port)`;
  known unicast → that port (`forwarded`, or `filtered` + `sameSegment` when it is the ingress port);
  broadcast / unknown → all other ports carrying the VLAN (`flooded`); SVIs are endpoints in their VLAN
  with the device's `baseMac`. Loop guard: a frame id seen in the last 1000 ms is `dropped l2Loop`.
- Endpoint (NIC, routed port, sub-interface, SVI): accept own MAC, broadcast (and multicast later); else
  `dropped notForThisInterface`. Untagged → native sub-interface or the port; tag v → sub-interface v
  (else `noSubInterface`). Routed / sub-interface frames use the physical port's MAC; tagged unless native.
- ARP per receiving interface (MODEL_V2 §11): answer only for that interface's own address; NICs never
  answer for an address that is not a valid host address of their subnet or that is a duplicate. Learn the
  sender from requests for us and from replies. Sender IP of a request = interface address (or
  `0.0.0.0` when it has none). Resolution as in §3.4; buffered packets leave as `sent` with a new frame id;
  failure: each packet `dropped arpTimeout`, then `network.onUndeliverable`.
- Duplicate address detection: every addressed NIC and SVI of a non-routing device probes when the device
  starts, its address changes or its link comes up. A probe answered by anyone, or a probe for the same
  address from someone else, marks the claim `duplicate` (both NICs lose it, engine parity); router-side
  interfaces answer probes and never give up. DHCP-assigned addresses are probed too (a DHCP client
  probes a lease before using it); a duplicate leased address is lost by both, like a static one. A
  duplicate NIC or management SVI neither answers ARP nor echoes.
- Cloud ports (`isp`): only frames from a far-end `routed` port are served (else `dropped ispNoService`);
  handoff `serviceUp: false` → `dropped ispServiceDown` (link light stays on). The cloud answers ARP for any
  public address (proxy ARP) and hands IPv4 to S2 with `interfaceId` = port id.
- Serial: HDLC, no ARP.

### 7.2 Network layer (S2)
- Sending from a host-role device follows the engine's order: source interface by `HostAttachment.select`
  (failure → `cableDisconnected` / `portDisabled`), then `noIpAddress`, `invalidConfig`,
  `invalidHostAddress`, `ipConflict` (S1 claim), invalid destination → `invalidConfig`; own address or
  loopback → delivered locally without frames; same subnet → on-link; else gateway: `gatewayNotSet`,
  `invalidConfig`, `gatewayOutsideSubnet`. These are `localFailure`s except `gatewayOutsideSubnet`, which a
  ping reports as "unreachable from own IP" (Windows / engine).
- Routers: source = exit interface address, else the first addressed up interface. Forwarding: own up
  address → local; TTL ≤ 1 → ICMP time exceeded; longest prefix then AD from `runtime.network.routes`;
  no route → public destination: silent `dropped noRoute` (engine `wanDown`), else ICMP host unreachable;
  route out of a port cabled to the cloud with a non-public destination → ICMP host unreachable
  (`privateToInternet`, engine parity); exit-interface routes ARP for the destination itself.
- ICMP errors are sourced from the interface the offending packet arrived on (for ARP failures:
  `ingressInterfaceId`), code `host` for no route and ARP failure (as IOS); never about ICMP errors,
  broadcasts or `0.0.0.0` sources. Hosts answer closed UDP ports with port unreachable, closed TCP ports
  with RST; routers likewise. Echo replies: hosts TTL 128, routers 255.
- ISP cloud: a public destination is the cloud itself (answers echo with TTL 118, hands UDP 53 / TCP 80 to
  S3); a non-public one is `dropped ispNoRoute`; nothing else is answered (silence, no ICMP). Replies go
  back out the arrival port to the frame's source MAC (`linkDestination`).
- Ping client: sequence 1..count, one echo at a time (§3.4); local ARP failure (`onUndeliverable` for an
  own packet) → `unreachable` from own address. Tracert: TTL 1..maxHops, `probesPerHop` probes, stops at
  echo reply (`reached`), an unreachable, `maxSilentHops` silent hops or `maxHops` (`hopLimit`).

### 7.3 Services (S3)
- DHCP server: on the receiving interface (or relay `giaddr`) pick the pool whose network is in that
  interface's subnet (`dhcpNoPool` otherwise), allocate with `DhcpPoolAllocator.pick(pool, chaddr, inUse,
  excludedRanges)` where `inUse` = addresses of every other device + the client's other interfaces + offered
  bindings (engine parity); none → `dhcpPoolExhausted` (no answer). OFFER / ACK broadcast. Relay:
  `helperAddresses` on the receiving interface forward unicast with `giaddr`; replies come back to the relay.
- DHCP client: DISCOVER → first OFFER wins → REQUEST → ACK → `dhcpLeaseBound` effect; 3 tries 2000 ms apart
  then `requestTimedOut`. Preconditions like `DhcpService.dhcpNics` (no DHCP NIC → `invalidConfig`;
  link problems → `cableDisconnected` / `portDisabled`). Release: DHCPRELEASE unicast, `dhcpLeaseReleased`.
- DNS client: servers in order like `DnsQuery.run`: answer → ok; NXDOMAIN → `nameNotFound`; port
  unreachable → remember, next; timeout or local failure → next; `ipConflict` / `invalidHostAddress` → stop
  with that reason; end → `dnsNoAnswer` if any server had no DNS, else `dnsUnreachable`. `useCache` only for
  name lookups before ping.
- DNS server (`services.dns.enabled`): records first (names via `DnsQuery.normalize`), else forwarders in
  order (500 ms each) as a client from the server; no forwarders → NXDOMAIN; a query for a name it is
  already forwarding → `dropped dnsLoop`. The cloud's resolvers (`internetHosts.publicDnsServers`) answer from
  `internetHosts.names` (TTL 300) or NXDOMAIN.
- HTTP: client = handshake, GET, response, close. Server today = the cloud on the addresses of
  `internetHosts.names` (200, fixed size); other public addresses refuse (RST). Server devices come with pack 5.5.

## 8. UI contract (U3)

`SimulationView.ts`: `SimMode`, `PLAY_SPEEDS` (0.25 … 4), `EventFilter { protocols, flowIds? }` (filters never
change the simulation), `PlaybackState`, `EventListItem { eventId, time, lastDeviceId?, deviceId, protocol,
action, flowId, summary }`, `InspectorModel { inLayers, outLayers: InspectorLayer { layer, title, notes }[],
inboundDetails, outboundDetails: PduLayerView[], decision }`, `PacketMarker { transmissionId, linkId,
fromDeviceId, toDeviceId, fraction, protocol, flowId, dropped }`.

- Event list rows from `events(fromId)`; summary = `SimMessages.action` (+ `SimMessages.reason`).
- Inspector: "In layers" from `inbound` + notes with `direction: 'in'`, "Out layers" from `outbound` + `out`
  notes; layer 1 row = the port (`inPortId` / `outPortIds`); details from `PduLayers.describe`.
- Map: a step's transmissions animate from `from` to `to`; `fraction` comes from animation time, not
  virtual latency (latencies are equal anyway). A transmission whose arrival event is `dropped` ends red.
  Several packets at once are normal (floods). Colours per `SimProtocol`.
- Step forward = `step('instant')` after pushing `snapshot()`; step back = `restore(pop())`; play = step per
  tick at the chosen speed; reset = new engine. Simple PDU tool = `inject({ kind: 'ping', count: 1, … })`.
- U3 builds against hand-made `SimEvent` fixtures or `SimulationKernel` with `nullLayers`; S1–S3 are not
  needed to build the UI.

## 9. Extension points (protocol packs)

| Pack | PDU slot (`ReservedPdus.ts`, `never` today) | Runtime slot (`RuntimeExtensions`) | Other |
|---|---|---|---|
| 5.1 STP, EtherChannel, CDP/LLDP, port security | `StpBpdu`, `LacpPdu`, `PagpPdu`, `CdpAdvertisement`, `LldpAdvertisement` | `stp`, `etherChannel`, `neighbors`, `portSecurity` | STP replaces the `l2Loop` guard; port states block forwarding |
| 5.2 ACL, NAT, SSH / Telnet (in progress, docs/SECURITY_PACK.md) | — (TCP 22 / 23 carry an opaque `RawData` payload; `SimProtocol` `ssh` / `telnet`) | `aclCounters`, `natTranslations`, `natStatistics` (`SecurityRuntime`) | `PacketPolicyChain([AclPolicy, NatPolicy])` on ingress (`PacketReceiver`, before the own-address check) and egress (`PacketForwarder`, after routing; router-originated packets skip it); reason codes `aclDenied`, `natPoolExhausted`, `natNoTranslation`, `vtyAccessDenied`, `remoteLoginFailed`, `remoteAccessDisabled`; ICMP `adminProhibited`; request `remoteConnect` |
| 5.3 RIP, OSPF, EIGRP, HSRP | `RipMessage`, `OspfPacket`, `EigrpPacket`, `HsrpMessage` | `rip`, `ospf`, `eigrp`, `hsrp` | `RouteCode` members |
| 5.4 IPv6 / NDP | `Ipv6Packet` | `ipv6` | `Pdu` gains `Ipv6Packet` |
| 5.5 servers | `ServerAppPayload` | — | listeners in S3 |
| 5.6 snooping / DAI | — | `dhcpSnooping` | |
| 5.7 WAN | `PppFrame`, `GrePacket` | — | ISP customer addressing (WAN DHCP) |
| 5.8 DTP / VTP | `DtpPdu`, `VtpPdu` | — | |

Replacing a `never` alias makes every exhaustive `switch` over the union fail to compile until it handles
the member (intended). New `SimProtocol`, `SimReason`, `RouteCode` members are additive the same way; each
pack adds its `simulation:` keys (tr + en) and its notes subtree.

## 10. Result mapping and the oracle

### 10.1 Terminal (I3)
The formatters stay; I3 maps results:
- **ping** → `PingOutcome` from the first echo (all echoes behave alike in a static lab; I3 may extend
  `PingFormatter` to per-echo lines): `reply` → `{ fromIp, ttl (from the packet), baseTimeMs:
  ReplyTimings.forRouters(target, routers).baseTimeMs }` where `routers` = events with the echo's
  `requestPduId`, action `forwarded`, layer 3; `unreachable` / `ttlExpired` → same kind and `fromIp`;
  `timeout` → timeout; `localFailure` → generalFailure. `PacketTrace.path` = devices of the request's
  events for `requestPduId` in order (up to the delivering / dropping device).
- **tracert** → hop `i` = first answering probe's `fromIp`, `baseTimeMs = i`; ending `reached` →
  complete, `unreachable` → unreachable (that hop's line replaced), `silent` → timedOut, `hopLimit`,
  `localFailure` → generalFailure.
- **nslookup / name lookup** → `DnsResult.answer` is a `ResolveResult`: existing formatting.
- **ipconfig /renew, /release** → adapters' failure `requestTimedOut` → `renewTimedOut`;
  `cableDisconnected` / `portDisabled` → media disconnected; `invalidConfig` → not permitted; success →
  apply effects, print adapters from the new network. **`arp -a`** → `RuntimeTables.arp(runtime, time)`
  grouped by interface.
- **AppLinks / verify**: reach = a ping with `count: 1` gets a reply; the answering device = the device
  of the `delivered` / `replied` event of `requestPduId`.

### 10.2 Oracle contract (O3)
On every generated topology (fresh engine, `settle`), for every host pair / public target:

| Rule engine | Simulator must give |
|---|---|
| `reach` ok | ping reply from the target; same `PacketTrace.path` |
| `powerOff` | request `aborted: deviceOff` |
| `cableDisconnected, portDisabled, noIpAddress, invalidConfig, invalidHostAddress, ipConflict, gatewayNotSet` | `localFailure` with the same reason |
| `gatewayOutsideSubnet`; `destinationNotInSegment` / `gatewayUnreachable` at the source | `unreachable` from own IP |
| `destinationNotInSegment`, `noRouteToDestination` at a router | `unreachable` from that router's ingress address |
| `gatewayUnreachable` elsewhere, `wanDown` | `timeout` |
| `ttlExpired` | `ttlExpired` from the engine's `expiredAtIp` |
| any of the above with `ReachTrace.silent` (broadcast target; ICMP error lost, decisions 3 / 7) | `timeout`; reason unchanged |
| `resolve` | equal `ResolveResult` |
| `renewDhcp` ok / fail | same address and `nextState` (after effects) / adapter failure |
| `appLinkStatus` | same ok and reason (via §10.1) |
| ping / tracert terminal text | identical, except §10.3 |

### 10.3 Accepted divergences (the simulator is right; O3 skips, I3 updates tests if any)
1. Gateway is a host or a non-routing device: engine "unreachable from own IP", simulator `timeout` (ARP
   succeeds, the host drops the packet).
2. Reply TTL from routers (255 − hops instead of 128 − hops) and from the internet behind two or more
   routers (118 − routers instead of 117). Pack 5.2 addition: a public address owned by a lab device (a
   provider router or a server "on the internet" built without the cloud, as in the NAT labs) gets the
   internet TTL from the engine; the simulator gives the device's own TTL.
3. Two DHCP servers in one segment: the first OFFER to arrive wins (engine: first in BFS order).
4. DHCP relay (`helperAddresses`) works in the simulator only.
5. DNS forwarder chains deeper than 4 servers resolve in the simulator (engine gives up).
6. After an edit, a duplicate address is found by the next probe (address change, link up, start), not at
   once; a conflict that disappears is noticed at the next probe too. O3 compares fresh engines only.
7. **ACL and NAT (pack 5.2) exist in the simulator only.** `src/engine` knows no access list, translation or
   remote login, so wherever it is used it ignores them: the app-link lights, `DeviceInfoModel`, the design
   `RequirementChecker` / `HandoverPack` and the samples' `StepChecker`. A denied packet still counts as
   delivered there, and a private source whose return path only NAT provides stays unreachable there. Every check
   that ACL / NAT can change runs on the simulator instead: exercises are graded by `SimSolveChecker`
   (`ExerciseAttempt`), including the `unreachable` condition; samples about ACL / NAT / SSH use manual
   steps and keep their promises in simulator tests (`securitySamples.test.ts`). The oracle skips a lab as a
   whole when any device has an access list, NAT rules, an `ip access-group` binding or a NAT role
   (`Divergences.securityPolicies`, counted as `securityPolicies`); vty `access-class` and SSH settings do
   not count because no ping or lookup crosses them.

## 11. Ownership and fixed APIs

### Wave 3.0 (K3, done)
`src/sim/contract/**`, `src/sim/core/**` (kernel, queue, RNG, latency, runtime tables, change plan,
`nullLayers`, tests), `src/sim/index.ts`, `src/sim/DeterminismGuard.test.ts`, namespace `simulation`
(`actions, protocols, layers, fields, reasons` + starter notes), this document.

### Wave 3.1 (parallel)
| Agent | Owns | Exports (fixed) | `simulation` keys |
|---|---|---|---|
| S1 layer 2 | `src/sim/l2/**`, `LinkLayerState.ts` (additive) | `src/sim/l2/index.ts`: `export const linkLayer: LinkLayer` | `notes.l1.*` (except `linkDown`), `notes.l2.*` |
| S2 layer 3 | `src/sim/l3/**`, `NetworkLayerState.ts` (additive) | `src/sim/l3/index.ts`: `export const networkLayer: NetworkLayer` | `notes.l3.*` |
| S3 services | `src/sim/services/**`, `ServiceLayerState.ts` (additive) | `src/sim/services/index.ts`: `export const serviceLayer: ServiceLayer` | `notes.services.*` |
| U3 UI | `src/features/simulation/**` | components + `useSimulation` hook of its choice | `ui.*` |

`src/sim/contract/**` (other files), `src/sim/core/**` and the frozen key groups are read-only in 3.1;
changes go through the coordinator. Every agent writes tr and en together. Each layer is unit-tested with
`SimulationKernel.create(lab, { ...nullLayers, <own>: ownLayer })` or with the other layers' exports once
they exist; until then S2 / S3 can stub the layers below with small test doubles of the same interfaces.
Interim agreement: S2 needs S1 for real frames; S2's tests may use a test `LinkLayer` that delivers
`LinkSend` packets straight to `onPacket` of the device owning the next hop.

### Wave 3.2
- **I3** (`src/engine/**` terminal glue, `src/session/**`, `src/sim/index.ts` default wiring
  `createSimulation(network, options?) = SimulationKernel.create(network, { link: linkLayer, network:
  networkLayer, services: serviceLayer }, options)`): terminal and verify on the simulator (§10.1), `arp -a`,
  lab document ⇄ engine sync (`reconfigure`, effects), rule engine kept as oracle only.
- **O3** (`src/sim/oracle/**`): `fast-check` topologies + golden tests for every exercise (§10.2, §10.3).

## 12. Open questions
1. **WAN addressing** stays deferred (MODEL_V2 decision 1): WAN ports remain address-less, routers source
   traffic out of them from their first addressed interface, the cloud answers on the arrival port. ISP
   DHCP comes with NAT (5.2) / WAN (5.7). OK?
2. **Printed ping times** are derived from the hop count (engine parity) rather than measured virtual
   RTT. Switch to measured times later (would change expected outputs)?
3. **Settle** leaves switches with learned MACs from the start-up probes. Prefer cold tables (flush after
   settle) for teaching "the first frame floods"?
4. **Engine helpers**: the simulator imports configuration readers from `src/engine`. Move them to a
   neutral `src/net/**` when the rule engine becomes oracle-only (I3)?
5. **802.11** is modelled as Ethernet between client and AP. Real 802.11 frames (three addresses,
   association) with pack 5.6?
6. **Per-echo ping output**: if echoes differ (a cache warming up, an edit in the middle), should I3 print
   per-echo lines (Windows does) instead of one outcome?

### Coordinator decisions (2026-11-06)
1. Defer ISP addressing / ISP DHCP to the NAT/WAN packs.
2. Terminal keeps the derived ping/tracert times (identical output, deterministic); the inspector may show
   the measured virtual times.
3. After `settle`, flush switch MAC tables and host/router ARP caches (keep DHCP and duplicate-address
   results) so learners see the first ARP broadcast and the first flooded frame. S1 implements it.
4. Yes — move the configuration readers to a neutral `src/net/**` in I3 (wave 3.2), no behaviour change.
5. Yes — real 802.11 frames with pack 5.6.
6. Yes — I3 prints per-echo lines when echoes differ (Windows behaviour).
7. Added to Phase 3 (BACKLOG items 4–6): `.pcap` export (U3 builds the encoder; I3 wires the download),
   simulator in a Web Worker (I3), Playwright e2e + GitHub Actions CI (separate track T1, before V3).

### Additions after S2 (2026-11-06)
- **Accepted divergence (§10.3):** when a router has no route to a private address, or fails ARP for a
  connected destination, the simulator's tracert shows that router once as a normal hop (time exceeded
  at TTL n) and then "reports: Destination host unreachable" at TTL n+1 (Cisco/Windows behaviour); the
  rule engine prints only the "reports:" line at hop n. O3 skips this case; I3 updates the expectation.
- **Result mapping (§10.1):** a ping from a router with no route to a public address is a timeout; with
  no route to a private address it is unreachable from the router's own source address.
- **Phase 4 note:** unresolved static routes stay in `runtime.network.routes` with `exitInterfaceId: null`;
  `show ip route` hides them.
- The cloud hands UDP/TCP to services only when `serviceLayer.listens()` is true; otherwise it drops
  silently (no ICMP). S3 listens on TCP 80 for public addresses if it wants to answer with RST itself.

### Additions after S1 (2026-11-06) — to do in wave 3.2 (I3 owns the kernel change)
1. Add optional `LinkLayer.onSettled?(ctx)`, called by `SimulationKernel.create` per device after the
   settle `runUntilIdle`; S1's interim `boot`-flow rule (learn but never store start-up traffic) is then
   replaced by flushing in `onSettled`.
2. Router counting for §10.1: a router waiting for ARP produces `buffered` (layer 3) then `sent`, not
   `forwarded` — count `forwarded`, `buffered` and `sent` layer-3 events per router.
3. New `SimReason` codes: `noEgressPort` (frame with no other port in its VLAN; S1 uses `filtered`) and
   `noDestinationMac` (cloud asked to send without a destination; S1 uses `unsupported`).
4. §7.1 per-interface ARP reference → MODEL_V2 §11 migration notes ("v2 answers ARP per interface").

### Additions after S3 and U3 (2026-11-06) — to do in wave 3.2
5. `Ipv4Send.notes?: readonly SimNote[]` — S2 adds them as out-notes on the `created` event (S3 already
   passes them via `NotedIpv4Send`; S2's `PacketSender` currently drops them).
6. Optional DHCP pool id on the wire model is NOT added; S3's configuration lookup stays.
7. No automatic DHCP DORA at start/link-up for now (keeps fresh engines identical to the rule engine);
   revisit when the UI can show it nicely.
8. `SimTransmission` gets the arrival event id (or `SimEvent` the arriving transmission id) so the UI no
   longer matches by time/device/port/frame.
9. `IpQuote.totalLength` so ICMP error quotes in .pcap are exact.
10. Docs: `InspectorLayer.title` is a protocol/port label; the layer name comes from `SimMessages.layer`.
11. Later: PCAPNG writer to export serial frames (Cisco HDLC) on a second interface.
12. U3's player exists only after Simulation mode opened once — I3 creates it up front; terminal requests
    go to the same player (simulation mode: queued; realtime: `runUntilDone`); DHCP effects are applied to
    the lab document so `reconfigure` after edits keeps them; the player is the Web Worker seam.

### Wave 3.2 — implemented by I3a (2026-11-06)
- `createSimulation(network, options?)` = kernel + S1/S2/S3 (`defaultLayers`); `SimTerminal` (instance + static
  API: start / collect|advance / run), `SimSolveChecker`, `SimAppLinks`, `SimProbes`, `SimHostViews`.
- Contract: `LinkLayer.onSettled?` (flushes dynamic MAC/ARP after settle; boot-flow rule removed),
  `Ipv4Send.notes?`, reasons `noEgressPort` (action stays `filtered`) and `noDestinationMac` (`dropped`),
  `SimEvent.transmissionId?` on arrivals, `IpQuote.totalLength?` (optional until fixtures add it), router
  counting = distinct routers with layer-3 forwarded/buffered/sent events.
- Cloud on provider outage: still answers ARP, drops IPv4 silently (engine parity: timeouts, not unreachable).
- Configuration readers moved to `src/net/**` (re-export stubs in `src/engine`); `src/sim` (except oracle and
  terminal parsing/formatting) must not import `src/engine` — enforced by `DeterminismGuard.test.ts`.
- `arp -a | -g | /a [ip]` (Windows table), `arp -d` / `arp -d *` (clear cache); single-entry delete is future work.
- Golden tests: accepted terminal differences = router reply TTL (§10.3.2), extra hop line before "reports:"
  (S2 addition), gateway-is-a-host timeouts (§10.3.1).

### Coordinator decisions on the O3 oracle mismatches (2026-11-06)
Principle: the simulator is the reference for realistic behaviour; the rule engine (still used by the design
checker and as oracle) is brought in line unless the simulator is the one that is wrong.
1. ISP service down → silence (timeouts) in both. Simulator: the cloud keeps answering ARP and drops IPv4
   (I3a already changed this — re-verify; if the router still gets ARP failures, fix S1/S2).
2. Native VLAN mismatch / native sub-interface semantics → simulator is right (IOS behaviour: untagged
   frames belong to the trunk's native VLAN). Engine (`VlanRules`/segments in src/net + engine) adopts it.
3. Ping to a network/broadcast address → simulator is right (no reply → timeout). Engine adopts it.
4. Management SVIs on non-routing switches behave like hosts: duplicate-address detection, the loser
   neither answers ARP nor echoes. Fix the simulator's inconsistency (answered ARP, dropped echo) and make
   the engine treat a duplicate management SVI like a host conflict.
5. DHCP-assigned addresses are probed too (DHCP clients ARP-probe before using a lease); a duplicate
   leased address → both lose it, like static (engine parity). Simulator changes; §7.1 updated.
6. Return path to private sources: the engine must check that replies from the internet (and from any
   destination) can be routed back hop by hop; missing route → timeout. Engine gap, fix engine.
7. ICMP errors / time-exceeded need a way back to the source; if the router cannot route to the source,
   the error is lost → timeout / `*`. Engine gap, fix engine.
8. Static route whose next hop is one of the router's own addresses → ignored in both (IOS refuses it).
9. AppLink/probe failure reasons: the simulator maps reasons from the actual drop/decision events so they
   equal the engine's reasons; the oracle keeps comparing reasons.
After the fixes the oracle must be green at 200 runs; any remaining class needs a documented decision.

### Engine side of the decisions — implemented by Q1 (2026-11-06)
- 2: segments need frames both ways (`SegmentFinder`): a native sub-interface takes frames tagged with its
  VLAN but answers untagged, so with another trunk native VLAN it is no member (gateway lost, DHCP silent);
  a tagged-native frame between switches with different native VLANs is one-way too. Members reached over
  links that carry the answer straight back skip the extra search (no cost in ordinary labs).
- 3: echo to a directed broadcast (or 255.255.255.255) → no answer: reason `destinationNotInSegment` (at the
  sender for its own subnet, at the last router otherwise) with `ReachTrace.silent`; ping / tracert time out.
  The network address is an address nobody owns: ARP fails, the sender / router reports unreachable (as the
  simulator does). Shared helper `Ipv4.isBroadcastFor(ip, address, mask)`.
- 4: `L3Interfaces.givesUpOnConflict(device, iface)` (NICs and SVIs of a non-routing device): such claimants
  lose a shared address (both sides); interfaces of routing devices and routed ports defend it.
- 5: confirmed: the engine never looked at the addressing mode; a duplicate leased address → `ipConflict`
  on both (test added).
- 6: replies from the internet need the WAN router (and every router after it) to route back to the sender;
  else `gatewayUnreachable` at the cloud (like "destination with no way back" at any destination) → timeout.
- 7: an ICMP error (unreachable, TTL expired) reaches the sender only if the reporting router can route back;
  else the reach result keeps its reason but is `silent` (timeout). Tracert: a router that cannot route back
  is a `*` hop (`TracertRoute.hops` may hold `null`); four such hops in a row end the trace like Windows.
  The `tracertRouterReports` skip (Additions after S2) now applies only when the "unreachable" gets back.
- 8: `RoutingTable` ignores a static route whose next hop is one of the router's configured addresses
  (with or without exit interface), like the simulator's `RouteTableBuilder`.
- Oracle: 0 mismatches at 200 labs (seed 20261106); `RandomLabOracle` has an explicit timeout
  (60 s + 1 s per lab). §10.3 is unchanged: none of its divergences disappeared.
