// `show ip interface [<interface>]`, reduced to what the lab models (pack 5.2): the status line, the
// address and the two access-list lines IOS prints in this order:
//   GigabitEthernet0/0 is up, line protocol is up
//     Internet address is 192.168.1.1/24
//     Outgoing access list is not set
//     Inbound  access list is 101
// (Cisco TAC document 13867, https://www.cisco.com/en/US/tech/tk59/technologies_tech_note09186a0080093f4c.shtml;
// the many other IOS lines — MTU, helper, proxy ARP, CEF … — are left out.)
import type { Device, NetworkState } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import { VlanRules } from '../../net/VlanRules'
import type { CliInterface } from '../contract'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { InterfaceNames } from '../core/InterfaceNames'
import { LinkStatus } from '../core/LinkStatus'
import { AclInterfaces } from './AclInterfaces'

function sviUp(network: NetworkState, device: Device, vlan: number): boolean {
  if (!VlanRules.inDatabase(device, vlan)) return false
  return device.ports.some((port) => port.role === 'switched' && VlanRules.egress(device, port, vlan) !== undefined && LinkStatus.portUp(network, device, port.id))
}

function state(network: NetworkState, device: Device, iface: CliInterface): { readonly adminUp: boolean; readonly up: boolean } {
  switch (iface.kind) {
    case 'port':
      return { adminUp: iface.port.adminUp, up: LinkStatus.portUp(network, device, iface.port.id) }
    case 'subInterface':
      return { adminUp: iface.sub.adminUp, up: iface.parent.adminUp && LinkStatus.portUp(network, device, iface.parent.id) }
    case 'svi':
      return { adminUp: iface.svi.adminUp, up: sviUp(network, device, iface.svi.vlan) }
  }
}

function statusLine(network: NetworkState, device: Device, iface: CliInterface): string {
  const { adminUp, up } = state(network, device, iface)
  const name = InterfaceNames.longName(iface.id)
  if (!adminUp) return `${name} is administratively down, line protocol is down`
  return up ? `${name} is up, line protocol is up` : `${name} is down, line protocol is down`
}

function block(network: NetworkState, device: Device, iface: CliInterface): string[] {
  const l3 = AclInterfaces.l3Of(iface)
  const { address, mask } = l3?.ipv4 ?? { address: '', mask: '' }
  if (l3 === undefined || address === '') return [statusLine(network, device, iface), '  Internet protocol processing disabled']
  const groups = l3.features?.accessGroups
  return [
    statusLine(network, device, iface),
    `  Internet address is ${address}/${Ipv4.prefixLength(mask) ?? 0}`,
    `  Outgoing access list is ${groups?.out ?? 'not set'}`,
    `  Inbound  access list is ${groups?.in ?? 'not set'}`,
  ]
}

export class IpInterfaceView {
  /** Every layer-3 interface, or only `interfaceId`. */
  static lines(network: NetworkState, device: Device, interfaceId: string | null): string[] {
    const view = LinkStatus.withDevice(network, device)
    const all = DeviceInterfaces.list(device)
    const shown = interfaceId === null ? all.filter((iface) => AclInterfaces.l3Of(iface) !== undefined) : all.filter((iface) => iface.id === interfaceId)
    return shown.flatMap((iface) => block(view, device, iface))
  }
}
