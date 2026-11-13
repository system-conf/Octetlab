# Sample lab library ("Örnek lablar")

Status: approved by the product owner (2026-11-06). Our own original sample labs that cover the same
topics a learner finds in other network simulators — never copied or converted from their files.

Every sample is a **mini lesson**, not just a topology:
- a ready, working lab (`LabDocument`) built with our catalog,
- a short explanation of the topic (tr + en, `samples` namespace): what it is, why it exists, where
  it is used in real networks,
- 3–5 guided **"try this"** steps (e.g. "ping PC2 from PC1 in Simulation mode and watch the ARP
  request"), each with an optional automatic check (reuses solve conditions / design requirements),
- "break it" ideas (what happens if you change X) and links to related exercises.

UI: a **Samples** section next to Exercises, grouped by category, searchable, each card shows topic,
level and required feature; "Open" loads it as a free lab (unlocked) with the lesson panel beside it.

## Catalogue (delivered together with the feature/pack that makes it possible)
| Category | Samples | Needs |
|---|---|---|
| Basics | two PCs and a switch; subnets and masks; default gateway; IP conflict; APIPA | now |
| DHCP | router as DHCP server; pools + exclusions; reservation-style static mapping; relay (`ip helper-address`); DHCP conflict | now / Phase 3 (relay) |
| DNS | local DNS server records; forwarders; multi-level DNS | now / Phase 3 |
| Switching | VLANs and trunks; native VLAN mismatch; allowed VLANs; inter-VLAN routing (router-on-a-stick, SVI) | now |
| Routing | static and default routes; floating static route; routing loop | now |
| Packet view | ARP step by step; MAC learning; TTL and tracert | Phase 3 |
| Device CLI | first switch config; router basic config; `show` commands tour | Phase 4 |
| STP / EtherChannel / CDP-LLDP / port security | loops and blocking; LACP bundle; neighbour discovery; sticky MAC | pack 5.1 |
| ACL / NAT / SSH-AAA | standard and extended ACL; static NAT, PAT; SSH login (`securityGuestAcl`, `securityOfficePat`, `securitySshOnly`; manual steps, promises tested on the simulator); office behind a firewall appliance: inside / DMZ / outside levels, published DMZ server (`securityFirewallOffice`, firewall pack, same category; manual steps, promises in `firewallSamples.test.ts`) | pack 5.2 / firewall pack |
| Dynamic routing / HSRP | RIPv2; OSPF single and multi-area; EIGRP; gateway redundancy | pack 5.3 |
| IPv6 | addressing; SLAAC; stateless and stateful DHCPv6; OSPFv3; dual stack | pack 5.4 |
| Servers and apps | web (HTTP/HTTPS), FTP/TFTP, e-mail, NTP, Syslog | pack 5.5 |
| Wireless | home router; guest Wi-Fi; WPA2-PSK; WLC with lightweight APs | pack 5.6 |
| WAN / security | serial + PPP; GRE; IPsec site-to-site; zone-based firewall on routers; PPPoE | pack 5.7 |
| Operations | QoS basics; SNMP; NetFlow; SPAN; VoIP | pack 5.8 |
| Industrial / IoT | OT network segmentation; industrial ring; IoT devices and gateway | pack 5.9 |

## Work split (first batch, after Phase 3 integration)
- **SL0 contract (alone):** `SampleDefinition` (lab, category, level, required features, lesson steps
  with optional checks), `samples` namespace layout, catalogue routing (`/samples`, `/samples/<id>`).
- **SL1 UI** (`src/features/samples/**`): list, search, lesson panel next to the workspace.
- **SL2 content** (`src/samples/**`, `samples` ns): every "now" + "Phase 3" row above, tested: each
  sample loads, passes `StateInvariants`, its checks are false before and true after the guided steps.
- Later packs add their own rows (each pack's definition of done includes its samples).

## Contract (SL0, fixed API — SL1 and SL2 build on these names)

Code: `src/samples/contract/**` (pure TS, no React), re-exported from `src/samples` (import from
there). Definitions: one file per category, `src/samples/content/<category>Samples.ts` (e.g.
`basicsSamples.ts` exports `basicsSamples`), collected in catalogue order by `contentSamples` in
`src/samples/content/index.ts`; `sampleDefinitions` in `src/samples/sampleDefinitions.ts` is the full
list the app uses (packs append their own lists there). Shared lab building blocks and the step-check
shorthands: `src/samples/content/sampleKit.ts`.

### `SampleDefinition` (`SampleTypes.ts`)
| Field | Meaning |
|---|---|
| `id` | camelCase; key under `samples:labs.<id>` and the `/samples/<id>` path segment |
| `category: SampleCategoryId` | one of the 16 rows above: `basics`, `dhcp`, `dns`, `switching`, `routing`, `packetView`, `deviceCli`, `switchingAdvanced`, `security`, `dynamicRouting`, `ipv6`, `servers`, `wireless`, `wanSecurity`, `operations`, `industrial` (order and delivery: `SAMPLE_CATEGORIES`) |
| `order` | ascending order inside the category (unique per category) |
| `level: SampleLevel` | `beginner` \| `intermediate` \| `advanced` (`SAMPLE_LEVELS`) |
| `features: SampleFeature[]` | features beyond the core: `simulation`, `dhcpRelay`, `dnsForwarding`, `deviceCli`; `SAMPLE_FEATURE_AVAILABILITY` says which exist (`deviceCli: false` until Phase 4). Unavailable → the sample is not listed. Packs add their features. |
| `lab: () => SampleLab` | factory, fresh objects every call: `{ state, layout, annotations? }`; every device has a position |
| `groups?: DeviceGroup[]` | named device sets for `network` checks |
| `steps: SampleStep[]` | 3–5 (`SAMPLE_STEP_LIMITS`): `{ id, checks?, mode?: 'simulation', focusDeviceId? }` |
| `breakIt: string[]` | ≥ 1 idea ids |
| `related: SampleLink[]` | `{ kind: 'exercise', exerciseId }` \| `{ kind: 'design', briefId }` \| `{ kind: 'sample', sampleId }` |

Device names in sample labs are final, language-neutral hostnames (`PC1`, `SW1`, `R1`, `DNS1`): user
content once opened, never translated (unlike exercise placeholders).

### Step checks (`StepCheck`, evaluated by `StepChecker` with the rule engine)
- `{ type: 'solve', condition: SolveCondition }` — exercise conditions (`internet`, `resolves`,
  `reachable`, `appLinksOk`).
- `{ type: 'network', condition: NetworkCondition }` — design conditions (`reachable`,
  `notReachable`, `internet`, `resolves`, `dhcpServes`, `separateSubnets`, `sameVlan`, `addressPlan`)
  on the state **as it is** (no DHCP settling, unlike design review). A group id that is not in
  `groups` names a single device (its device id).
- `{ type: 'hasAddress', deviceId, prefix? }` — the device has an IPv4 address (inside the CIDR).
- `{ type: 'nativeVlanMatch', linkId, vlan? }` — both ends of cable `linkId` are trunk switchports
  with the same native VLAN (equal to `vlan` when given). Reads the port settings, so a "fix" that
  turns the uplink into access ports (pings work, tagged VLANs break) does not pass. Fails when the
  cable, a device or a port is gone (a re-drawn cable gets a new id). Shorthand
  `nativeVlanMatch(linkId, vlan?)` in `sampleKit.ts`.
- `{ type: 'not', check }` — negation ("PC1 can no longer reach PC2").
- No `checks` (or `[]`) = **manual** step: the learner ticks it. Use it for everything only visible in
  Simulation mode (ARP request, MAC learning, TTL), and for DHCP relay (the rule engine does not
  relay; only the simulator does).
- A step passes when all its checks hold. A check about a deleted device fails, never throws.
- **Honest checks.** Checks see the lab state, not the running simulator. When the simulator only
  catches up after an action the state cannot show (a PC that lost its address to a conflict keeps
  "(Duplicate)" until it is restarted; power off + on leaves the same state), check only what holds
  at once and put the rest in a manual step whose text says to tick it (example: `basicsIpConflict`
  `fixConflict` + `restartPc1`). Guard against fixes the rule engine accepts but the lesson does not
  mean (moving the wrong device, giving up the trunk): add a check on the setting itself.

`new StepChecker(sample)` → `check(state): StepStatus[]` (step order), `checkStep(state, step)`,
`holds(state, check)`. `StepStatus` = `{ stepId, kind: 'manual' }` \| `{ stepId, kind: 'auto', ok,
checks: CheckResult[] }`. Cheap enough to run debounced on every lab change (a few reach probes).

### Texts (`samples` namespace)
```
samples:
  ui.*                               SL1 (screens, buttons, lesson panel)
  categories.<categoryId>.title|description
  levels.<level>
  features.<feature>
  labs.<sampleId>.title              card + lesson header
  labs.<sampleId>.summary            one line for the card
  labs.<sampleId>.intro.what|why|realWorld
  labs.<sampleId>.steps.<stepId>.title|detail
  labs.<sampleId>.breakIt.<ideaId>.change|result
  labs.<sampleId>.topics             string array (search, card tags)
```
Keys: `SampleTextKeys` (`title`, `summary`, `intro`, `step`, `breakIt`, `topics`, `categoryTitle`,
`categoryDescription`, `level`, `feature`, `stringKeys(sample)` = every string key of one sample).
Reading: `new SampleTextReader(t).texts(sample)` → `SampleTexts` (missing text → warn + id fallback);
`title(id)`, `summary(id)`. Owners: SL1 `ui.*`; SL2 `labs.*`; SL0 / packs `categories`, `levels`,
`features`. Turkish uses the informal "sen" register; device output quoted in steps stays English.

### Catalogue, opening, progress
- `new SampleCatalog(sampleDefinitions)`: `byCategory()` (non-empty categories in order, samples by
  `order`), `available()`, `find(id)` (undefined when unknown or unavailable), `isAvailable(sample)`,
  static `matches(fields, query, language)` (every query word in one localized field; case / accent /
  Turkish İ-ı insensitive).
- `openSampleLab(sample, { title, now })` → a free, unlocked `LabDocument` (pass the localized title).
- `SampleProgressBook` (immutable): `empty()`, `fromJson(text | null)`, `parse(unknown)`, `of(id)`,
  `isDone(id, stepId)`, `completion(sample)` → `{ done, total, complete }`,
  `withPassedSteps(sample, statuses, now)` (records passed auto steps; a step stays done when the lab is
  broken later), `withStepsDone(sample, stepIds, now)` (ticks), `withStepUndone`, `withReset(id)`,
  `toJson()`. Stored in localStorage under `SAMPLE_PROGRESS_STORAGE_KEY`
  (`agArizaLab.samples.progress`). `SampleProgress` = `{ sampleId, doneStepIds, updatedAt,
  completedAt? }`; the learning path (BACKLOG 9) will read the same book.
- `SampleValidator` (tests only): `validate(sample)` / `validateAll(samples)` → `SampleIssue[]`
  (ids, step count, break-it, invariants, positions, fresh factory, device references, CIDR,
  `nativeVlanMatch` cables (`unknownLink`, `notSwitchLink`), related links against
  `{ exerciseIds, briefIds, sampleIds }`).

### Routes (SL1 implements; SL0 does not edit routing)
- `AppRoute` additions: `{ name: 'samples' }` ↔ `/samples`, `{ name: 'sample'; sampleId: string }` ↔
  `/samples/<id>` (id must match the camelCase id pattern; anything deeper → `notFound`).
- `routes.samples` and `routes.sample(sampleId)` in `src/routing/AppRoute.ts`; codec tests for both.
- `/samples/<id>` with an unknown or unavailable id → replace with `/samples`.
- `/samples/<id>` opens the workspace with `openSampleLab` (unlocked, normal editing) and the lesson
  panel beside it; it does not overwrite the learner's autosaved `/lab` lab. A reload reopens the
  fresh sample (progress survives in the book); "Save as my lab" stores it with `saveLabAsNew`.
- Landing: a "Samples" entry next to Exercises.

### SL2 content checklist (per sample)
- Definition in `src/samples/content/<category>Samples.ts`, added to that file's list (e.g.
  `basicsSamples`); a new category file is added to `contentSamples` in `src/samples/content/index.ts`
  (which feeds `sampleDefinitions`). Texts tr + en in `src/locales/<lang>/samples.json`.
- Tests (`src/samples/content/*.test.ts`): `sampleContent.test.ts` — the validator
  (`new SampleValidator({ exerciseIds, briefIds }).validateAll(sampleDefinitions)` is `[]`) and every
  `SampleTextKeys.stringKeys` key in tr and en; `sampleSolutions.test.ts` — a solution for each
  automatic step (edits in `testSolutions.ts`): not ok on the fresh lab, ok after the guided change
  (a step that only observes is a manual step); `sampleBehaviour.test.ts` — what the texts promise in
  the terminal (simulator) and in the break-it ideas.
- Checks are honest (see Step checks): an automatic step never passes before the simulator shows the
  result the text promises.
