// Which access list an interface binds (`ip access-group`), read from the configuration of the device.
// Interface ids are those of L3Interfaces: a routed port id, a sub-interface id ('Gi0/0.10') or 'Vlan<n>'.
import type { AccessList, AclBinding, Device, L3Settings } from '../../../domain'

const SVI_ID = /^Vlan(\d+)$/

export class AclBindings {
  static l3Of(device: Device, interfaceId: string): L3Settings | undefined {
    const svi = SVI_ID.exec(interfaceId)
    if (svi !== null) return device.switching?.svis.find((candidate) => candidate.vlan === Number(svi[1]))?.l3
    for (const port of device.ports) {
      if (port.role !== 'routed') continue
      if (port.id === interfaceId) return port.l3
      const sub = port.subInterfaces.find((candidate) => candidate.id === interfaceId)
      if (sub !== undefined) return sub.l3
    }
    return undefined
  }

  static of(device: Device, interfaceId: string): AclBinding | undefined {
    return AclBindings.l3Of(device, interfaceId)?.features?.accessGroups
  }

  static list(device: Device, name: string): AccessList | undefined {
    return device.features?.accessLists?.lists.find((list) => list.name === name)
  }
}
