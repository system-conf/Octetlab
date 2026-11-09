// Picks the cable and ports for `connect` when the caller leaves them out: the first free pair of
// ports (in port order, console ports only for a console cable) that CableRules accepts.
import { CableRules, type CableType, type Device, type LinkCable, type LinkEnd, type NetworkState, type Port } from '../../../src/domain'

export type CableChoice = CableType | 'auto'

export interface PlannedCable {
  a: LinkEnd
  b: LinkEnd
  cable: CableType
}

export class PortPicker {
  private readonly rules = new CableRules()

  /** Ports of `device` that hold no cable (radios take any number of wireless clients). */
  freePorts(state: NetworkState, device: Device): Port[] {
    return device.ports.filter((port) => port.role === 'radio' || !state.links.some((link) => this.uses(link.a, device, port) || this.uses(link.b, device, port)))
  }

  /** The cable for two given ports: `choice`, or the textbook cable when 'auto'. null = no cable fits. */
  cableFor(state: NetworkState, a: LinkEnd, b: LinkEnd, choice: CableChoice): CableType | null {
    return choice === 'auto' ? this.rules.autoCable(state, a, b) : choice
  }

  /** First workable pair; `portA` / `portB` fix one or both ends. null when none is free and compatible. */
  plan(state: NetworkState, deviceA: Device, deviceB: Device, choice: CableChoice, portA?: string, portB?: string): PlannedCable | null {
    const candidatesA = portA === undefined ? this.candidates(state, deviceA, choice) : [portA]
    const candidatesB = portB === undefined ? this.candidates(state, deviceB, choice) : [portB]
    for (const idA of candidatesA) {
      for (const idB of candidatesB) {
        const a = { deviceId: deviceA.id, portId: idA }
        const b = { deviceId: deviceB.id, portId: idB }
        const cable = this.cableFor(state, a, b, choice)
        if (cable === null) continue
        if (portA !== undefined && portB !== undefined) return { a, b, cable }
        if (this.rules.check(state, { a, b, ...this.settingsFor(cable, deviceA, deviceB) }).ok) return { a, b, cable }
      }
    }
    return null
  }

  /** Extra link fields a cable needs: the DCE end of a serial cable, the SSID of a wireless one. */
  settingsFor(cable: CableType, deviceA: Device, deviceB: Device, ssid?: string): LinkCable {
    if (cable === 'serial') return { cable, dceEnd: 'a' }
    if (cable === 'wireless') return { cable, ssid: ssid ?? this.firstSsid(deviceA) ?? this.firstSsid(deviceB) ?? '' }
    return { cable }
  }

  private candidates(state: NetworkState, device: Device, choice: CableChoice): string[] {
    return this.freePorts(state, device)
      .filter((port) => (choice === 'console' ? port.medium === 'console' : port.medium !== 'console'))
      .filter((port) => choice === 'auto' || port.medium === CableRules.mediumOf(choice))
      .map((port) => port.id)
  }

  private firstSsid(device: Device): string | undefined {
    return device.wireless?.ssids[0]?.ssid
  }

  private uses(end: LinkEnd, device: Device, port: Port): boolean {
    return end.deviceId === device.id && end.portId === port.id
  }
}
