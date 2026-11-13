// Object NAT → pack 5.2 NAT data (docs/FIREWALL_PACK.md §6.3). The pack 5.2 engine stays the only NAT:
//   nat (in,out) dynamic interface  → overload rule to the `out` port + a generated standard ACL of the object
//   nat (in,out) dynamic <ip>       → overload rule to a one-address pool (PAT to one address; UNVERIFIED that
//                                     appliances treat an inline host this way, recalled from the object NAT guide)
//   nat (in,out) static <ip>        → a static 1:1 row (host objects only)
// and `natRole` inside / outside on the two ports. Every derived row is named after the object, so `withdraw`
// can remove exactly what `apply` added and `apply` is idempotent (replaying running-config twice is harmless).
import type { AccessList, Device, FirewallNetworkObject, NatRole } from '../../domain'
import { AclEdits } from '../acl/AclEdits'
import { AclSyntax } from '../acl/AclSyntax'
import { DeviceEdits } from '../core/DeviceEdits'
import { NatEdits } from '../nat/NatEdits'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces } from './FirewallInterfaces'
import { NetmaskAclTranslator } from './NetmaskAclTranslator'
import { FIREWALL_ERRORS } from './firewallMessages'

export type MapResult = { readonly ok: true; readonly device: Device } | { readonly ok: false; readonly error: string }

const SINGLE_ADDRESS_MASK = '255.255.255.255'
const GENERATED_PREFIX = 'OBJ_NAT_'

export class ObjectNatMapper {
  /** Name of the ACL / pool generated for an object. */
  static generatedName(objectName: string): string {
    return `${GENERATED_PREFIX}${objectName}`
  }

  /** Removes the rows `object` produced (no-op when it has no complete NAT). */
  static withdraw(device: Device, object: FirewallNetworkObject): Device {
    const nat = object.nat
    if (nat === undefined || object.address === undefined) return device
    const name = ObjectNatMapper.generatedName(object.name)
    let next = device
    if (nat.type === 'dynamic') {
      next = NatEdits.update(next, (settings) => ({
        ...settings,
        dynamics: settings.dynamics.filter((rule) => rule.aclName !== name),
        pools: settings.pools.filter((pool) => pool.name !== name),
      }))
      next = AclEdits.remove(next, name)
    } else if (nat.mapped.kind === 'address') {
      const global = nat.mapped.address
      const local = object.address.address
      next = NatEdits.update(next, (settings) => ({
        ...settings,
        statics: settings.statics.filter((rule) => !(rule.protocol === undefined && rule.insideLocal === local && rule.insideGlobal === global)),
      }))
    }
    return ObjectNatMapper.dropUnusedRoles(next, object)
  }

  /** Adds the rows of `object` (which must already be stored in `device`'s settings for the role check). */
  static apply(device: Device, object: FirewallNetworkObject): MapResult {
    const nat = object.nat
    if (nat === undefined) return { ok: true, device }
    if (object.address === undefined) return { ok: false, error: FIREWALL_ERRORS.objectWithoutAddress(object.name) }
    const real = FirewallInterfaces.byName(device, nat.realInterface)
    if (real === undefined) return { ok: false, error: FIREWALL_ERRORS.unknownNameif(nat.realInterface) }
    const mapped = FirewallInterfaces.byName(device, nat.mappedInterface)
    if (mapped === undefined) return { ok: false, error: FIREWALL_ERRORS.unknownNameif(nat.mappedInterface) }
    let next = device
    if (nat.type === 'static') {
      if (object.address.kind !== 'host' || nat.mapped.kind !== 'address') return { ok: false, error: FIREWALL_ERRORS.staticNeedsHost }
      const rule = { kind: 'static' as const, insideLocal: object.address.address, insideGlobal: nat.mapped.address }
      next = NatEdits.update(next, (settings) => ({
        ...settings,
        statics: settings.statics.some((candidate) => candidate.protocol === undefined && candidate.insideLocal === rule.insideLocal && candidate.insideGlobal === rule.insideGlobal)
          ? settings.statics
          : [...settings.statics, rule],
      }))
    } else {
      const name = ObjectNatMapper.generatedName(object.name)
      next = ObjectNatMapper.withSourceList(next, name, object)
      const mappedAddress = nat.mapped.kind === 'address' ? nat.mapped.address : null
      next = NatEdits.update(next, (settings) => {
        const pools = settings.pools.filter((pool) => pool.name !== name)
        const rule = {
          kind: 'dynamic' as const,
          aclName: name,
          target: mappedAddress === null ? { kind: 'interface' as const, interfaceId: mapped.iface.id } : { kind: 'pool' as const, poolName: name },
          overload: true,
        }
        const exists = settings.dynamics.some((candidate) => candidate.aclName === name)
        return {
          ...settings,
          pools: mappedAddress === null ? pools : [...pools, { name, start: mappedAddress, end: mappedAddress, netmask: SINGLE_ADDRESS_MASK }],
          dynamics: exists ? settings.dynamics.map((candidate) => (candidate.aclName === name ? rule : candidate)) : [...settings.dynamics, rule],
        }
      })
    }
    next = ObjectNatMapper.withRole(next, real.iface.id, 'inside')
    next = ObjectNatMapper.withRole(next, mapped.iface.id, 'outside')
    return { ok: true, device: next }
  }

  /** The generated list holds exactly one `permit <object address>` entry (replaces older content). */
  private static withSourceList(device: Device, name: string, object: FirewallNetworkObject): Device {
    const address = object.address
    if (address === undefined) return device
    const wildcard = address.kind === 'host' ? '0.0.0.0' : NetmaskAclTranslator.maskOf(address.mask)
    const source = AclSyntax.masked(address.address, wildcard)
    const list: AccessList = { name, type: 'standard', entries: [{ kind: 'standard', action: 'permit', source, seq: 10 }] }
    const all = AclEdits.listsOf(device)
    const lists = all.some((candidate) => candidate.name === name) ? all.map((candidate) => (candidate.name === name ? list : candidate)) : [...all, list]
    return AclEdits.withLists(device, lists)
  }

  private static withRole(device: Device, interfaceId: string, role: NatRole): Device {
    return DeviceEdits.updateL3(device, interfaceId, (l3) => (l3.features?.natRole === role ? l3 : NatEdits.withRole(l3, role)))
  }

  /** Clears the roles `object` set when no other object NAT still uses that interface name. */
  private static dropUnusedRoles(device: Device, object: FirewallNetworkObject): Device {
    const nat = object.nat
    if (nat === undefined) return device
    const others = FirewallEdits.objectsOf(device).filter((candidate) => candidate.name !== object.name && candidate.nat !== undefined)
    let next = device
    for (const nameif of [nat.realInterface, nat.mappedInterface]) {
      const used = others.some((candidate) => candidate.nat?.realInterface === nameif || candidate.nat?.mappedInterface === nameif)
      const target = FirewallInterfaces.byName(next, nameif)
      if (used || target === undefined || target.l3.features?.natRole === undefined) continue
      next = DeviceEdits.updateL3(next, target.iface.id, (l3) => NatEdits.withRole(l3, undefined))
    }
    return next
  }
}
