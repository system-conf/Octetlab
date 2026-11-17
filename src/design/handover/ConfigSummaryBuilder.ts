import { AclSyntax } from '../../cli/acl/AclSyntax'
import type { Device, DhcpServerSettings, DnsServerSettings, StaticRoute, WirelessSecurity } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import { AclBindings } from '../../sim/policy/acl/AclBindings'
import { L3Interfaces, type L3Interface } from '../../engine'
import { localizedMessage } from '../../i18n/messageKeys'
import { Cidr } from '../Cidr'
import { DesignLabels } from '../DesignLabels'
import { withPrefix } from './DeviceListBuilder'
import type { ConfigItem, DeviceConfig, HandoverText } from './HandoverTypes'
import type { LabIndex } from './LabIndex'

/** Placeholder of an empty technical value. */
const NONE = '—'

function list(values: readonly string[]): string {
  return values.length === 0 ? NONE : values.join(', ')
}

/**
 * Per-device configuration summary: addresses and the access lists bound to them, gateway / DNS,
 * VLANs, routes, access lists, DHCP pools, DNS service, SSIDs and application links. Devices with
 * nothing configured are left out; ordered by kind
 * (routers, switches, …, end devices), lab order within a kind.
 */
export class ConfigSummaryBuilder {
  build(index: LabIndex): DeviceConfig[] {
    const configs: DeviceConfig[] = []
    for (const device of index.state.devices) {
      const items = this.items(index, device)
      if (items.length > 0) configs.push({ ...index.ref(device.id), kind: device.kind, items })
    }
    return configs.sort((a, b) => DesignLabels.compareKinds(a.kind, b.kind))
  }

  private items(index: LabIndex, device: Device): ConfigItem[] {
    return [
      ...L3Interfaces.of(device).flatMap((iface) => [...this.interfaceItems(index, device, iface), ...this.accessGroupItems(device, iface)]),
      ...this.hostItems(device),
      ...this.switchingItems(device),
      ...this.routingItems(device),
      ...this.accessListItems(device),
      ...this.dhcpItems(device.services?.dhcp),
      ...this.dnsItems(device.services?.dns),
      ...(device.wireless?.ssids ?? []).map((entry) => ({
        label: localizedMessage('design:handover.config.ssid', { ssid: entry.ssid }),
        value: this.ssidValue(entry.vlan, entry.security),
      })),
      ...(device.internet?.handoffs ?? [])
        .filter((handoff) => !handoff.serviceUp)
        .map((handoff) => ({ label: localizedMessage('design:handover.config.handoff', { port: handoff.portId }), value: localizedMessage('design:handover.values.outage') })),
    ]
  }

  /**
   * Addressed or DHCP interfaces. Left out: unconfigured ports, and network cards on DHCP without an
   * address and without a cable (e.g. the unused wired port of a laptop on Wi-Fi).
   */
  private interfaceItems(index: LabIndex, device: Device, iface: L3Interface): ConfigItem[] {
    const addressed = L3Interfaces.isAddressed(iface)
    if (!addressed && iface.addressing !== 'dhcp') return []
    if (!addressed && iface.kind === 'nic' && iface.portId !== undefined && !index.cabledPorts(device).includes(iface.portId)) return []
    const label =
      iface.vlan === undefined
        ? localizedMessage('design:handover.config.interface', { interface: iface.id })
        : localizedMessage('design:handover.config.vlanInterface', { interface: iface.id, vlan: iface.vlan })
    const address = addressed ? withPrefix(iface.address, iface.mask) : ''
    let value: HandoverText = address
    if (iface.addressing === 'dhcp') {
      if (addressed) value = localizedMessage('design:handover.values.dhcpAddress', { address })
      else value = localizedMessage(index.facesProvider(iface) ? 'design:handover.values.dhcpProvider' : 'design:handover.values.dhcpNoAddress')
    }
    if (!iface.adminUp) value = localizedMessage('design:handover.values.adminDown', { address: address === '' ? 'DHCP' : address })
    return [{ label, value }]
  }

  /** `ip access-group` bindings of a routed port, sub-interface or SVI. */
  private accessGroupItems(device: Device, iface: L3Interface): ConfigItem[] {
    if (iface.kind === 'nic') return []
    const binding = AclBindings.of(device, iface.id)
    if (binding === undefined) return []
    const label = localizedMessage('design:handover.config.accessGroup', { interface: iface.id })
    return [
      ...(binding.in === undefined ? [] : [{ label, value: localizedMessage('design:handover.values.aclIn', { name: binding.in }) }]),
      ...(binding.out === undefined ? [] : [{ label, value: localizedMessage('design:handover.values.aclOut', { name: binding.out }) }]),
    ]
  }

  /** Each access list with its entries in order, as the configuration writes them. */
  private accessListItems(device: Device): ConfigItem[] {
    return (device.features?.accessLists?.lists ?? []).map((accessList) => ({
      label: localizedMessage('design:handover.config.accessList', { name: accessList.name }),
      value: accessList.entries.length === 0 ? NONE : accessList.entries.map((entry) => AclSyntax.entryText(entry)).join(' · '),
    }))
  }

  private hostItems(device: Device): ConfigItem[] {
    const host = device.host
    if (!host) return []
    const items: ConfigItem[] = []
    if (host.defaultGateway !== '') items.push({ label: localizedMessage('design:handover.config.gateway'), value: host.defaultGateway })
    if (host.dnsServers.length > 0) items.push({ label: localizedMessage('design:handover.config.dnsServers'), value: list(host.dnsServers) })
    for (const appLink of host.appLinks) {
      items.push({ label: localizedMessage('design:handover.config.appLink', { label: appLink.label }), value: appLink.targetIp })
    }
    return items
  }

  private switchingItems(device: Device): ConfigItem[] {
    const switching = device.switching
    if (!switching) return []
    const items: ConfigItem[] = []
    if (switching.vlans.some((entry) => entry.id !== 1)) {
      items.push({ label: localizedMessage('design:handover.config.vlans'), value: list(switching.vlans.map((entry) => `${entry.id} ${entry.name}`)) })
    }
    if (switching.defaultGateway !== '') {
      items.push({ label: localizedMessage('design:handover.config.switchGateway'), value: switching.defaultGateway })
    }
    return items
  }

  private routingItems(device: Device): ConfigItem[] {
    const routing = device.routing
    if (!routing) return []
    const items: ConfigItem[] = []
    // Routers always route; on an L3 switch / wireless router `ip routing` is a choice worth documenting.
    if (device.kind !== 'router') {
      items.push({ label: localizedMessage('design:handover.config.ipRouting'), value: localizedMessage(routing.ipRouting ? 'design:handover.values.on' : 'design:handover.values.off') })
    }
    for (const route of routing.staticRoutes) {
      items.push({ label: localizedMessage('design:handover.config.route', { destination: withPrefix(route.prefix, route.mask) }), value: this.routeTarget(route) })
    }
    return items
  }

  /** 'next hop', 'exit interface' or both; a non-default distance as '[AD n]' (floating static route). */
  private routeTarget(route: StaticRoute): string {
    const target = [route.exitInterfaceId, route.nextHop].filter((part): part is string => part !== undefined && part !== '').join(' ')
    return route.adminDistance === 1 ? target : `${target} [AD ${route.adminDistance}]`
  }

  private dhcpItems(dhcp: DhcpServerSettings | undefined): ConfigItem[] {
    if (!dhcp || (dhcp.pools.length === 0 && !dhcp.enabled)) return []
    if (!dhcp.enabled) return [{ label: localizedMessage('design:handover.config.dhcp'), value: localizedMessage('design:handover.values.off') }]
    const items: ConfigItem[] = dhcp.pools.map((pool) => {
      const bounds = Cidr.hostBounds(pool.network, pool.mask)
      const range = pool.range ?? { start: bounds?.first ?? NONE, end: bounds?.last ?? NONE }
      return {
        label: localizedMessage('design:handover.config.dhcpPool', { pool: pool.id }),
        value: localizedMessage('design:handover.values.dhcpPool', {
          network: withPrefix(pool.network, pool.mask),
          start: range.start,
          end: range.end,
          gateway: pool.defaultRouter === '' ? NONE : pool.defaultRouter,
          dns: list(pool.dnsServers),
        }),
      }
    })
    if (dhcp.excludedRanges.length > 0) {
      const ranges = dhcp.excludedRanges.map((range) => (range.start === range.end ? range.start : `${range.start} – ${range.end}`))
      items.push({ label: localizedMessage('design:handover.config.dhcpExcluded'), value: list(ranges) })
    }
    return items
  }

  private dnsItems(dns: DnsServerSettings | undefined): ConfigItem[] {
    if (!dns?.enabled) return []
    return [
      { label: localizedMessage('design:handover.config.dnsForwarders'), value: list(dns.forwarders) },
      ...dns.records.map((record) => ({ label: localizedMessage('design:handover.config.dnsRecord', { name: record.name }), value: record.address })),
    ]
  }

  private ssidValue(vlan: number, security: WirelessSecurity): LocalizedMessage {
    switch (security.mode) {
      case 'open':
        return localizedMessage('design:handover.values.ssidOpen', { vlan })
    }
  }
}
