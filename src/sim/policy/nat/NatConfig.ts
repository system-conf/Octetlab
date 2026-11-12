// Read-only questions about a device's NAT configuration (docs/SECURITY_PACK.md §8): the role of an
// interface (`ip nat inside|outside`), the static rows, the addresses a pool hands out. Pure over the
// Device, so the CLI views and the GUI use it too.
import type { Device, L3Features, NatPool, NatRole, NatSettings } from '../../../domain'
import { Ipv4 } from '../../../net/Ipv4'
import { L3Interfaces } from '../../../net/L3Interfaces'
import type { NatTranslation } from '../../contract/SecurityRuntime'

/** Largest pool the lab walks address by address (a /16); bigger ranges are cut there. */
const MAX_POOL_ADDRESSES = 65_536

export class NatConfig {
  /** The device's NAT settings; undefined when NAT is not configured. Tolerates a missing device. */
  static of(device: Device | undefined): NatSettings | undefined {
    return device?.features?.nat
  }

  /** L3 features of a routed port, sub-interface or SVI by interface id. */
  static featuresOf(device: Device, interfaceId: string): L3Features | undefined {
    for (const port of device.ports) {
      if (port.role !== 'routed') continue
      if (port.id === interfaceId) return port.l3.features
      const sub = port.subInterfaces.find((candidate) => candidate.id === interfaceId)
      if (sub !== undefined) return sub.l3.features
    }
    return device.switching?.svis.find((svi) => `Vlan${svi.vlan}` === interfaceId)?.l3.features
  }

  static roleOf(device: Device, interfaceId: string): NatRole | undefined {
    return NatConfig.featuresOf(device, interfaceId)?.natRole
  }

  /** Interface ids with the given role, in configuration order. */
  static interfacesWithRole(device: Device, role: NatRole): string[] {
    return L3Interfaces.of(device)
      .filter((iface) => iface.kind !== 'nic' && NatConfig.roleOf(device, iface.id) === role)
      .map((iface) => iface.id)
  }

  /** The interface's own address; '' when it has none. */
  static addressOf(device: Device, interfaceId: string): string {
    const iface = L3Interfaces.find(device, interfaceId)
    return iface !== undefined && L3Interfaces.isAddressed(iface) ? iface.address : ''
  }

  /** The static rules as table rows: never expire, `---` columns for the outside. */
  static staticRows(nat: NatSettings): NatTranslation[] {
    return nat.statics.map((rule) => {
      const ported = rule.protocol !== undefined && rule.insideLocalPort !== undefined && rule.insideGlobalPort !== undefined
      return {
        protocol: ported ? (rule.protocol ?? 'any') : 'any',
        insideLocal: ported ? { ip: rule.insideLocal, port: rule.insideLocalPort } : { ip: rule.insideLocal },
        insideGlobal: ported ? { ip: rule.insideGlobal, port: rule.insideGlobalPort } : { ip: rule.insideGlobal },
        origin: 'static',
        createdAt: 0,
        lastUsedAt: 0,
        expiresAt: null,
      }
    })
  }

  /**
   * Addresses a pool hands out, lowest first. The network and broadcast addresses of the pool's mask are
   * skipped (the IOS address-conservation example hands out .209 first from a .208/28 pool), and so are
   * the router's own addresses ("the interface IP must not be in the pool").
   */
  static poolAddresses(device: Device, pool: NatPool): string[] {
    const start = Ipv4.parse(pool.start)
    const end = Ipv4.parse(pool.end)
    if (start === null || end === null || end < start) return []
    const own = new Set(L3Interfaces.of(device).map((iface) => iface.address))
    const checkMask = Ipv4.isValidMask(pool.netmask)
    const addresses: string[] = []
    for (let value = start; value <= end && addresses.length < MAX_POOL_ADDRESSES; value++) {
      const ip = Ipv4.format(value)
      if (checkMask && !Ipv4.isHostAddress(ip, pool.netmask)) continue
      if (!own.has(ip)) addresses.push(ip)
    }
    return addresses
  }

  /** True when `ip` is an inside global address NAT may own: a pool address or a static global. */
  static isInsideGlobal(device: Device, nat: NatSettings, ip: string): boolean {
    if (nat.statics.some((rule) => rule.insideGlobal === ip)) return true
    const value = Ipv4.parse(ip)
    if (value === null) return false
    return nat.pools.some((pool) => {
      const start = Ipv4.parse(pool.start)
      const end = Ipv4.parse(pool.end)
      return start !== null && end !== null && value >= start && value <= end && !L3Interfaces.of(device).some((iface) => iface.address === ip)
    })
  }
}
