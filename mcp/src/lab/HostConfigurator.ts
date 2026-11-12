// configure_host: addressing of an end device's NIC (DHCP or static) and its gateway / DNS servers.
import type { Device, HostPort, LabDocument } from '../../../src/domain'
import { Ipv4 } from '../../../src/net/Ipv4'
import { ToolError } from '../errors/ToolError'
import type { DeviceAccess } from './DeviceAccess'

export type HostAddressing = { mode: 'dhcp' } | { mode: 'static'; ip: string; mask: string }

/** configure_host / build_lab input: the mode plus, for static, ip and mask. */
export interface HostAddressingInput {
  mode: 'dhcp' | 'static'
  ip?: string | undefined
  mask?: string | undefined
}

/** The addressing of a tool input; a ToolError when static mode lacks ip or mask. */
export function hostAddressingOf(input: HostAddressingInput): HostAddressing {
  if (input.mode === 'dhcp') return { mode: 'dhcp' }
  if (input.ip === undefined || input.mask === undefined) throw ToolError.validation('Static mode needs both ip and mask.')
  return { mode: 'static', ip: input.ip, mask: input.mask }
}

/** configure_host / build_lab host settings as the tools receive them. */
export interface HostSettingsInput extends HostAddressingInput {
  portId?: string | undefined
  gateway?: string | undefined
  dnsServers?: string[] | undefined
}

/** The request for HostConfigurator.configure (absent fields stay absent). */
export function hostSettingsRequestOf(deviceId: string, input: HostSettingsInput): HostSettingsRequest {
  return {
    deviceId,
    addressing: hostAddressingOf(input),
    ...(input.portId === undefined ? {} : { portId: input.portId }),
    ...(input.gateway === undefined ? {} : { gateway: input.gateway }),
    ...(input.dnsServers === undefined ? {} : { dnsServers: input.dnsServers }),
  }
}

export interface HostSettingsRequest {
  deviceId: string
  /** NIC id (eth0, wlan0); default: the first NIC. */
  portId?: string
  addressing: HostAddressing
  /** '' clears it; absent keeps it. */
  gateway?: string
  dnsServers?: readonly string[]
}

export class HostConfigurator {
  private readonly devices: DeviceAccess

  constructor(devices: DeviceAccess) {
    this.devices = devices
  }

  configure(doc: LabDocument, request: HostSettingsRequest): { doc: LabDocument; device: Device; portId: string } {
    const device = this.devices.require(doc, request.deviceId)
    if (device.host === undefined) throw ToolError.validation(`${device.id} is a ${device.kind}, not an end device. Use apply_cli_config for routers and switches.`)
    const nic = this.nicOf(device, request.portId)
    this.checkAddresses(request)
    const ipv4 =
      request.addressing.mode === 'dhcp'
        ? { addressing: 'dhcp' as const, address: '', mask: '' }
        : { addressing: 'static' as const, address: request.addressing.ip, mask: request.addressing.mask }
    const ports = device.ports.map((port) => (port.id === nic.id ? { ...nic, l3: { ...nic.l3, ipv4 } } : port))
    const host = {
      ...device.host,
      ...(request.gateway === undefined ? {} : { defaultGateway: request.gateway }),
      ...(request.dnsServers === undefined ? {} : { dnsServers: [...request.dnsServers] }),
    }
    const changed: Device = { ...device, ports, host }
    return { doc: this.devices.update(doc, changed), device: changed, portId: nic.id }
  }

  private nicOf(device: Device, portId: string | undefined): HostPort {
    const nics = device.ports.filter((port): port is HostPort => port.role === 'host')
    const nic = portId === undefined ? nics[0] : nics.find((port) => port.id === portId)
    if (nic === undefined) {
      throw ToolError.notFound(`${device.id} has no network card "${portId ?? ''}". Network cards: ${nics.map((port) => port.id).join(', ') || '(none)'}.`)
    }
    return nic
  }

  private checkAddresses(request: HostSettingsRequest): void {
    if (request.addressing.mode === 'static') {
      const { ip, mask } = request.addressing
      if (!Ipv4.isValid(ip)) throw ToolError.validation(`"${ip}" is not a valid IPv4 address.`)
      if (!Ipv4.isValidMask(mask)) throw ToolError.validation(`"${mask}" is not a valid subnet mask (for example 255.255.255.0).`)
      if (!Ipv4.isHostAddress(ip, mask)) throw ToolError.validation(`${ip} is the network or broadcast address of its subnet with mask ${mask}; pick a host address.`)
    }
    if (request.gateway !== undefined && request.gateway !== '' && !Ipv4.isValid(request.gateway)) {
      throw ToolError.validation(`Gateway "${request.gateway}" is not a valid IPv4 address.`)
    }
    const badDns = request.dnsServers?.find((server) => !Ipv4.isValid(server))
    if (badDns !== undefined) throw ToolError.validation(`DNS server "${badDns}" is not a valid IPv4 address.`)
  }
}
