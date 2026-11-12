// get_lab: the settings configure_device edits (SSIDs, DHCP / DNS server, ISP service lines), in the
// same shapes configure_device takes, plus short text lines for the readable outline.
import type { Device } from '../../../src/domain'
import { InternetServiceModel } from '../../../src/features/deviceConfig/model/InternetServiceModel'

export interface DhcpPoolView {
  name: string
  network: string
  mask: string
  rangeStart?: string
  rangeEnd?: string
  defaultRouter: string
  dnsServers: string[]
  leases: number
}

export interface DeviceSettingsViewData {
  ssids?: { ssid: string; vlan: number; security: string }[]
  dhcp?: { enabled: boolean; pools: DhcpPoolView[]; excludedRanges: { start: string; end: string }[] }
  dns?: { enabled: boolean; forwarders: string[]; records: { name: string; address: string }[] }
  internetService?: { portId: string; up: boolean }[]
}

export class DeviceSettingsView {
  view(device: Device): DeviceSettingsViewData {
    const { wireless } = device
    const dhcp = device.services?.dhcp
    const dns = device.services?.dns
    return {
      ...(wireless === undefined ? {} : { ssids: wireless.ssids.map((ssid) => ({ ssid: ssid.ssid, vlan: ssid.vlan, security: ssid.security.mode })) }),
      ...(dhcp === undefined
        ? {}
        : {
            dhcp: {
              enabled: dhcp.enabled,
              pools: dhcp.pools.map((pool) => ({
                name: pool.id,
                network: pool.network,
                mask: pool.mask,
                ...(pool.range === undefined ? {} : { rangeStart: pool.range.start, rangeEnd: pool.range.end }),
                defaultRouter: pool.defaultRouter,
                dnsServers: [...pool.dnsServers],
                leases: pool.leases.length,
              })),
              excludedRanges: dhcp.excludedRanges.map((range) => ({ start: range.start, end: range.end })),
            },
          }),
      ...(dns === undefined
        ? {}
        : { dns: { enabled: dns.enabled, forwarders: [...dns.forwarders], records: dns.records.map((record) => ({ name: record.name, address: record.address })) } }),
      ...(device.kind === 'internet' ? { internetService: InternetServiceModel.serviceLines(device).map((line) => ({ portId: line.portId, up: line.serviceUp })) } : {}),
    }
  }

  /** Indented outline lines ("    SSIDs: Cafe (vlan 1, open)"), none when the device has no such settings. */
  text(settings: DeviceSettingsViewData): string[] {
    const lines: string[] = []
    if (settings.ssids !== undefined) {
      lines.push(`SSIDs: ${settings.ssids.map((ssid) => `${ssid.ssid} (vlan ${ssid.vlan}, ${ssid.security})`).join(', ') || '(none)'}`)
    }
    if (settings.dhcp !== undefined) {
      const pools = settings.dhcp.pools.map((pool) => `${pool.name} ${pool.network}/${pool.mask}${pool.rangeStart === undefined ? '' : ` ${pool.rangeStart}-${pool.rangeEnd ?? ''}`} gw ${pool.defaultRouter || '-'}`)
      lines.push(`DHCP server ${settings.dhcp.enabled ? 'on' : 'off'}: ${pools.join('; ') || 'no pools'}`)
    }
    if (settings.dns !== undefined) {
      const records = settings.dns.records.map((record) => `${record.name}=${record.address}`)
      lines.push(`DNS server ${settings.dns.enabled ? 'on' : 'off'}: ${records.join(', ') || 'no records'}${settings.dns.forwarders.length === 0 ? '' : `; forwarders ${settings.dns.forwarders.join(', ')}`}`)
    }
    const down = settings.internetService?.filter((line) => !line.up) ?? []
    if (down.length > 0) lines.push(`ISP outage on ${down.map((line) => line.portId).join(', ')}`)
    return lines.map((line) => `    ${line}`)
  }
}
