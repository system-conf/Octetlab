// What the front panel shows per port: the plugged cable, the link light and a status for the
// tooltip and the port table. Built on DeviceInfoModel (link light, neighbours, settings summary
// with exercise locks applied), so a hidden setting never shows up here either.
//
// The simulator only knows a physical link as up or down (networkEngine.linkLight); there is no
// "starting" or STP-blocking state, so the light is either lit (green) or dark.
import type { CableType, Device, NetworkState, PortMedium, PortRole } from '../../../domain'
import { Topology } from '../../../engine'
import type { ConfigLocks } from '../../deviceConfig'
import { DeviceInfoModel, type AddressSummary, type NeighbourInfo } from '../../deviceConfig/model/DeviceInfoModel'

/**
 * Status of a port, strongest first: the device is off, the port is shut down (when the exercise
 * shows the setting), the link is up, a cable is plugged but there is no link, the cable was
 * pulled out, nothing is attached.
 */
export type PortCondition = 'deviceOff' | 'adminDown' | 'up' | 'noLink' | 'unplugged' | 'empty'

/** Settings shown next to a port: address, access VLAN, trunk, nothing, or hidden by an exercise lock. */
export type PortDetail =
  | { kind: 'address'; ipv4: AddressSummary }
  | { kind: 'access'; vlan: number }
  | { kind: 'trunk' }
  | { kind: 'none' }
  | { kind: 'hidden' }

export interface PortPanelState {
  portId: string
  medium: PortMedium
  role: PortRole
  condition: PortCondition
  /** Link light lit (green). */
  lit: boolean
  /** Cable plugged into the socket (a connected link); null = empty socket or a wireless association. */
  plug: Exclude<CableType, 'wireless'> | null
  peers: readonly NeighbourInfo[]
  detail: PortDetail
}

export class PortPanelStatus {
  static of(state: NetworkState, device: Device, locks: ConfigLocks): PortPanelState[] {
    const topology = Topology.of(state)
    return DeviceInfoModel.ports(state, device, locks).map((info) => {
      const links = topology.linksAt(device.id, info.id)
      const plugged = links.find((link) => link.connected && link.cable !== 'wireless')
      const condition = PortPanelStatus.conditionOf(device.powered, info.adminUp, info.light)
      return {
        portId: info.id,
        medium: info.medium,
        role: info.role,
        condition,
        lit: condition === 'up',
        plug: plugged && plugged.cable !== 'wireless' ? plugged.cable : null,
        peers: info.neighbours,
        detail: PortPanelStatus.detailOf(info.settings),
      }
    })
  }

  static conditionOf(powered: boolean, adminUp: boolean | null, light: 'up' | 'down' | 'noCable' | 'unplugged'): PortCondition {
    if (!powered) return 'deviceOff'
    if (adminUp === false) return 'adminDown'
    switch (light) {
      case 'up':
        return 'up'
      case 'down':
        return 'noLink'
      case 'unplugged':
        return 'unplugged'
      case 'noCable':
        return 'empty'
    }
  }

  private static detailOf(settings: ReturnType<typeof DeviceInfoModel.settingsOf> | null): PortDetail {
    if (settings === null) return { kind: 'hidden' }
    switch (settings.kind) {
      case 'l3':
        return { kind: 'address', ipv4: settings.ipv4 }
      case 'access':
        return { kind: 'access', vlan: settings.vlan }
      case 'trunk':
        return { kind: 'trunk' }
      case 'none':
        return { kind: 'none' }
    }
  }
}
