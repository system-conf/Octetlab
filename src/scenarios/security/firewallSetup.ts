// Firewall pack device settings as DeviceChanges (the securitySetup pattern), stored the way the firewall
// CLI stores them (docs/FIREWALL_PACK.md §4, §6): `nameif` / `security-level` per interface, the device-wide
// firewall settings and object NAT mapped onto the pack 5.2 NAT rows (§6.3). Used by the firewall
// exercises, their fixes and the firewall sample lab. They throw on a wrong port id.
import type { AccessList, Device, L3Settings, FirewallNetworkObject, FirewallSettings, NatSettings, NatStaticRule, RoutedPort } from '../../domain'
import type { DeviceChange } from '../design/deviceSetup'
import { ANY, accessLists, natRole } from './securitySetup'

function changeRoutedPort(device: Device, portId: string, change: (port: RoutedPort) => RoutedPort): Device {
  if (!device.ports.some((port) => port.id === portId && port.role === 'routed')) throw new Error(`${device.id} has no routed port ${portId}`)
  return { ...device, ports: device.ports.map((port) => (port.id === portId && port.role === 'routed' ? change(port) : port)) }
}

/** `nameif <name>` plus `security-level <level>` when given (absent: 0, or 100 for 'inside'). */
export function nameif(portId: string, name: string, securityLevel?: number): DeviceChange {
  const firewall = securityLevel === undefined ? { nameif: name } : { nameif: name, securityLevel }
  return (device) => changeRoutedPort(device, portId, (port) => ({ ...port, l3: { ...port.l3, features: { ...port.l3.features, firewall } } }))
}

/** `no nameif` (and with it the level): the interface carries no traffic (lab rule D3). */
export function noNameif(portId: string): DeviceChange {
  return (device) =>
    changeRoutedPort(device, portId, (port) => {
      const features = { ...port.l3.features }
      delete features.firewall
      const l3: L3Settings = { ...port.l3, features }
      if (Object.keys(features).length === 0) delete l3.features
      return { ...port, l3 }
    })
}

/** Merges device-wide firewall settings (`same-security-traffic`, `inspect icmp`, `timeout …`). */
export function firewallSettings(settings: FirewallSettings): DeviceChange {
  return (device) => ({ ...device, features: { ...device.features, firewall: { ...device.features?.firewall, ...settings } } })
}

/**
 * `access-list OUTSIDE_IN extended permit tcp any host <server> eq www` and `… permit icmp any host
 * <server>`: the exception names the server's real address (D6); bind it in on the outside interface.
 */
export function webException(serverAddress: string): AccessList {
  const server = { address: serverAddress, wildcard: '0.0.0.0' }
  return {
    name: 'OUTSIDE_IN',
    type: 'extended',
    entries: [
      { seq: 10, kind: 'extended', action: 'permit', protocol: 'tcp', source: ANY, destination: server, destinationPort: { op: 'eq', port: 80 } },
      { seq: 20, kind: 'extended', action: 'permit', protocol: 'icmp', source: ANY, destination: server },
    ],
  }
}

/** Real and mapped side of an object NAT line: nameif and the port that carries it. */
export interface NatSide {
  nameif: string
  portId: string
}

/**
 * `object network <name>` / `host <local>` / `nat (<real>,<mapped>) static <global>`: the object as
 * running-config prints it, the pack 5.2 static row it maps onto (kept with the existing NAT rules) and
 * the NAT roles of both ports (§6.3).
 */
export function objectStaticNat(name: string, insideLocal: string, insideGlobal: string, real: NatSide, mapped: NatSide): DeviceChange {
  const row: NatStaticRule = { kind: 'static', insideLocal, insideGlobal }
  const object: FirewallNetworkObject = {
    name,
    address: { kind: 'host', address: insideLocal },
    nat: { realInterface: real.nameif, mappedInterface: mapped.nameif, type: 'static', mapped: { kind: 'address', address: insideGlobal } },
  }
  return withObjectNat(object, (nat) => ({ ...nat, statics: [...nat.statics, row] }), real, mapped)
}

/**
 * `object network <name>` / `subnet <network> <mask>` / `nat (<real>,<mapped>) dynamic interface`: PAT on
 * the mapped interface. The pack 5.2 row needs an access list of the real addresses: `OBJ_NAT_<name>`, the
 * name the firewall CLI generates (ObjectNatMapper.generatedName).
 */
export function objectDynamicInterface(name: string, network: string, mask: string, wildcard: string, real: NatSide, mapped: NatSide): DeviceChange {
  const object: FirewallNetworkObject = {
    name,
    address: { kind: 'subnet', address: network, mask },
    nat: { realInterface: real.nameif, mappedInterface: mapped.nameif, type: 'dynamic', mapped: { kind: 'interface' } },
  }
  const aclName = `OBJ_NAT_${name}`
  const list = accessLists([{ name: aclName, type: 'standard', entries: [{ seq: 10, kind: 'standard', action: 'permit', source: { address: network, wildcard } }] }])
  const rule = { kind: 'dynamic' as const, aclName, target: { kind: 'interface' as const, interfaceId: mapped.portId }, overload: true }
  const nat = withObjectNat(object, (current) => ({ ...current, dynamics: [...current.dynamics, rule] }), real, mapped)
  return (device) => nat(list(device))
}

function withObjectNat(object: FirewallNetworkObject, addRow: (nat: NatSettings) => NatSettings, real: NatSide, mapped: NatSide): DeviceChange {
  return (device) => {
    const nat = addRow(device.features?.nat ?? { pools: [], statics: [], dynamics: [] })
    const objects = [...(device.features?.firewall?.objects ?? []), object]
    const withNat: Device = { ...device, features: { ...device.features, nat, firewall: { ...device.features?.firewall, objects } } }
    return natRole(mapped.portId, 'outside')(natRole(real.portId, 'inside')(withNat))
  }
}
