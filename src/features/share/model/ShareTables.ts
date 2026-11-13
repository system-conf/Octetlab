// Share pages (docs/SHARE_PAGES.md §6): the tables under the topology, derived from the frozen lab:
// addressed interfaces per device, the VLAN database of the switches and the IPv4 subnets in use.
// Pure functions of the document, so the page and tests compute the same thing.
import type { Device, DeviceKind, LabDocument } from '../../../domain'
import { Ipv4, L3Interfaces, Topology } from '../../../net'

export interface InterfaceRow {
  /** Port, sub-interface or `Vlan<n>` id. */
  interfaceId: string
  /** `192.168.1.10/24`, or '' when the interface has no address yet. */
  address: string
  /** Address learned by DHCP. */
  dhcp: boolean
  /** Access VLAN (host NIC on an access port, sub-interface or SVI), null when none applies. */
  vlan: number | null
}

export interface DeviceRow {
  deviceId: string
  name: string
  kind: DeviceKind
  interfaces: InterfaceRow[]
}

export interface VlanRow {
  id: number
  name: string
  /** Names of the switches that have the VLAN in their database. */
  switches: string[]
}

export interface SubnetMember {
  deviceName: string
  interfaceId: string
  address: string
}

export interface SubnetRow {
  /** `192.168.10.0/24`. */
  network: string
  members: SubnetMember[]
}

export interface ShareTables {
  devices: DeviceRow[]
  vlans: VlanRow[]
  subnets: SubnetRow[]
}

/** VLANs IOS creates for legacy media; not part of a lab's design. */
const LEGACY_VLANS = new Set([1002, 1003, 1004, 1005])

const byName = (first: { name: string }, second: { name: string }): number => first.name.localeCompare(second.name, undefined, { numeric: true })

export class ShareTableBuilder {
  static build(doc: LabDocument): ShareTables {
    const devices = [...doc.state.devices].sort(byName)
    const topology = Topology.of(doc.state)
    const rows = devices.map((device) => ShareTableBuilder.deviceRow(device, topology))
    return { devices: rows, vlans: ShareTableBuilder.vlans(devices), subnets: ShareTableBuilder.subnets(rows) }
  }

  private static deviceRow(device: Device, topology: Topology): DeviceRow {
    const interfaces = L3Interfaces.of(device).map((iface): InterfaceRow => {
      const prefix = iface.mask === '' ? null : Ipv4.prefixLength(iface.mask)
      const address = iface.address === '' || prefix === null ? '' : `${iface.address}/${prefix}`
      const vlan = iface.vlan ?? (iface.kind === 'nic' && iface.portId !== undefined ? ShareTableBuilder.accessVlan(device, iface.portId, topology) : null)
      return { interfaceId: iface.id, address, dhcp: iface.addressing === 'dhcp', vlan }
    })
    return { deviceId: device.id, name: device.name, kind: device.kind, interfaces }
  }

  /** VLAN of the access switchport the NIC is cabled to (null for trunks, hubs, wireless, nothing). */
  private static accessVlan(device: Device, portId: string, topology: Topology): number | null {
    for (const link of topology.linksAt(device.id, portId)) {
      const far = topology.farEnd(link, device.id, portId)
      if (far.port?.role === 'switched' && far.port.l2.mode === 'access') return far.port.l2.accessVlan
    }
    return null
  }

  private static vlans(devices: readonly Device[]): VlanRow[] {
    const vlans = new Map<number, VlanRow>()
    for (const device of devices) {
      for (const entry of device.switching?.vlans ?? []) {
        if (LEGACY_VLANS.has(entry.id)) continue
        const row = vlans.get(entry.id) ?? { id: entry.id, name: entry.name, switches: [] }
        row.switches.push(device.name)
        vlans.set(entry.id, row)
      }
    }
    return [...vlans.values()].sort((first, second) => first.id - second.id)
  }

  private static subnets(rows: readonly DeviceRow[]): SubnetRow[] {
    const subnets = new Map<string, SubnetRow & { sortKey: number }>()
    for (const row of rows) {
      for (const iface of row.interfaces) {
        const network = ShareTableBuilder.networkOf(iface.address)
        if (network === null) continue
        const subnet = subnets.get(network.text) ?? { network: network.text, members: [], sortKey: network.value }
        subnet.members.push({ deviceName: row.name, interfaceId: iface.interfaceId, address: iface.address.split('/')[0] ?? '' })
        subnets.set(network.text, subnet)
      }
    }
    return [...subnets.values()]
      .sort((first, second) => first.sortKey - second.sortKey || first.network.localeCompare(second.network))
      .map(({ network, members }) => ({ network, members }))
  }

  /** `10.0.0.5/24` → `10.0.0.0/24` with its numeric value (for sorting); null for '' or garbage. */
  private static networkOf(cidr: string): { text: string; value: number } | null {
    const [address, prefixText] = cidr.split('/')
    const prefix = Number(prefixText)
    if (address === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
    const mask = Ipv4.format(Ipv4.prefixToMask(prefix))
    const network = Ipv4.network(address, mask)
    if (network === null) return null
    return { text: `${Ipv4.format(network)}/${prefix}`, value: network }
  }
}
