// Running-config output of the firewall set (docs/FIREWALL_PACK.md §6.5). Every line replays through a
// command of this set (round trip in firewallConfig.test.ts).
//   interface slot 55:  nameif, security-level
//   global slot 76:     same-security-traffic · object network definitions (host / subnet) · access-group ·
//                       timeout + `no inspect icmp`
//   global slot 87:     object network blocks with their `nat` line
// Appliances print an object twice: first where the addresses are defined, later with the nat line,
// "because you cannot reference objects … not yet created in nat commands"
// (https://community.cisco.com/t5/network-security/asa-8-3-object-network-two-different-places-in-config/m-p/1612140).
// The lab also needs the nat block after the access lists (85): the nat line regenerates the object's
// source list, so it must run after the ACL section has replayed that list (idempotent end state).
import type { Device, FirewallNetworkObject, FirewallObjectNat, FirewallTimeouts } from '../../domain'
import type { InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { INTERFACE_LINE_ORDER, RUNNING_CONFIG_ORDER } from '../contract'
import { FirewallClock } from './FirewallClock'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces } from './FirewallInterfaces'

/** After access lists (85), before banner (90). */
export const OBJECT_NAT_CONFIG_ORDER = RUNNING_CONFIG_ORDER.accessLists + 2

const TIMEOUT_WORDS: readonly (readonly [keyof FirewallTimeouts, string])[] = [
  ['tcp', 'conn'],
  ['halfClosed', 'half-closed'],
  ['udp', 'udp'],
  ['icmp', 'icmp'],
]

function objectLines(object: FirewallNetworkObject): string[] {
  const { address } = object
  const body = address === undefined ? [] : [address.kind === 'host' ? ` host ${address.address}` : ` subnet ${address.address} ${address.mask}`]
  return [`object network ${object.name}`, ...body]
}

export function natLine(nat: FirewallObjectNat): string {
  const mapped = nat.mapped.kind === 'interface' ? 'interface' : nat.mapped.address
  return `nat (${nat.realInterface},${nat.mappedInterface}) ${nat.type} ${mapped}`
}

function sameSecurityBlock(device: Device): string[] {
  const settings = FirewallEdits.settingsOf(device)
  return [
    ...(settings.sameSecurityInterInterface === true ? ['same-security-traffic permit inter-interface'] : []),
    ...(settings.sameSecurityIntraInterface === true ? ['same-security-traffic permit intra-interface'] : []),
  ]
}

function accessGroupBlock(device: Device): string[] {
  return FirewallInterfaces.named(device).flatMap((named) => {
    const groups = named.l3.features?.accessGroups
    return [
      ...(groups?.in === undefined ? [] : [`access-group ${groups.in} in interface ${named.nameif}`]),
      ...(groups?.out === undefined ? [] : [`access-group ${groups.out} out interface ${named.nameif}`]),
    ]
  })
}

function timeoutBlock(device: Device): string[] {
  const settings = FirewallEdits.settingsOf(device)
  const lines = TIMEOUT_WORDS.flatMap(([key, word]) => {
    const seconds = settings.timeouts?.[key]
    return seconds === undefined ? [] : [`timeout ${word} ${FirewallClock.format(seconds)}`]
  })
  return settings.inspectIcmp === false ? [...lines, 'no inspect icmp'] : lines
}

const firewallSection: RunningConfigSection = {
  id: 'firewallGlobal',
  order: RUNNING_CONFIG_ORDER.firewall,
  blocks: (device) => {
    const blocks = [sameSecurityBlock(device), ...FirewallEdits.objectsOf(device).map(objectLines), accessGroupBlock(device), timeoutBlock(device)]
    return blocks.filter((block) => block.length > 0)
  },
}

const objectNatSection: RunningConfigSection = {
  id: 'firewallObjectNat',
  order: OBJECT_NAT_CONFIG_ORDER,
  blocks: (device) =>
    FirewallEdits.objectsOf(device).flatMap((object) => (object.nat === undefined ? [] : [[`object network ${object.name}`, ` ${natLine(object.nat)}`]])),
}

const nameifLines: InterfaceConfigContributor = {
  id: 'firewallNameif',
  order: INTERFACE_LINE_ORDER.firewall,
  lines: (_device, iface) => {
    const settings = FirewallInterfaces.settingsOf(iface)
    if (settings === undefined) return []
    return [`nameif ${settings.nameif}`, ...(settings.securityLevel === undefined ? [] : [`security-level ${settings.securityLevel}`])]
  },
}

export const firewallConfigSections: readonly RunningConfigSection[] = [firewallSection, objectNatSection]
export const firewallInterfaceLines: readonly InterfaceConfigContributor[] = [nameifLines]
