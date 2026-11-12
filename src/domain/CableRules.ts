// Which cable may join which two ports (docs/MODEL_V2.md §6). Pure; used by the workspace cable
// tool (B1), the lab validator on import (B2) and the migration tests. The engine decides link
// lights and traffic; these rules only decide what may be plugged in.
import { isEndDeviceKind, type DeviceKind, type Device } from './DeviceTypes'
import type { CableRequest, CableType, Link, LinkEnd, LinkSide } from './LinkTypes'
import type { NetworkState } from './NetworkState'
import type { CopperPinout, Port, PortMedium } from './PortTypes'

/** Why a cable is refused. `side` (when set) names the offending end of the request. */
export type CableRefusal =
  | 'unknownDevice'
  | 'unknownPort'
  /** Both ends on one device (loops are refused until the STP pack). */
  | 'sameDevice'
  /** The cable's connector does not fit the port's medium (e.g. fiber into a copper port). */
  | 'cableDoesNotFitPort'
  /** A wireless association needs one client NIC (role 'host') and one radio (role 'radio'). */
  | 'wirelessNeedsClientAndRadio'
  /** The port already holds a link (connected or unplugged). Radio ports take any number. */
  | 'portInUse'
  /** A console cable joins an end device (terminal) to a network device's console port. */
  | 'consoleNeedsTerminal'
  /** A wireless association must name an SSID. */
  | 'ssidRequired'
  /** Auto-MDIX is off on both ends and both use the same pinout: a crossover cable is needed. */
  | 'crossoverRequired'
  /** Auto-MDIX is off on both ends and the pinouts differ: a straight-through cable is needed. */
  | 'straightThroughRequired'

export type CableCheck = { ok: true } | { ok: false; reason: CableRefusal; side?: LinkSide }

interface ResolvedEnd {
  side: LinkSide
  device: Device
  port: Port
}

type Resolution = { ok: true; end: ResolvedEnd } | { ok: false; reason: CableRefusal }

const OK: CableCheck = { ok: true }

const CABLE_MEDIUM: Readonly<Record<CableType, PortMedium>> = {
  copperStraight: 'copper',
  copperCross: 'copper',
  fiber: 'fiber',
  serial: 'serial',
  console: 'console',
  coaxial: 'coaxial',
  wireless: 'wireless',
}

/** Kinds whose copper ports are wired MDI-X like a switch (everything else is MDI). */
const MDIX_KINDS: readonly DeviceKind[] = ['switch', 'l3Switch', 'hub', 'internet']

function refuse(reason: CableRefusal, side?: LinkSide): CableCheck {
  return side === undefined ? { ok: false, reason } : { ok: false, reason, side }
}

export class CableRules {
  /** Medium a cable's connectors fit. */
  static mediumOf(cable: CableType): PortMedium {
    return CABLE_MEDIUM[cable]
  }

  /**
   * Checks a new cable, in this order (first failure wins): ends exist → not the same device →
   * connectors fit → ports free → console / SSID rules → copper pinout (only when auto-MDIX is off
   * on both ends). `ignoreLinkId` excludes an existing link from the "port in use" check.
   */
  check(state: NetworkState, request: CableRequest, ignoreLinkId?: string): CableCheck {
    const first = this.resolve(state, request.a, 'a')
    if (!first.ok) return refuse(first.reason, 'a')
    const second = this.resolve(state, request.b, 'b')
    if (!second.ok) return refuse(second.reason, 'b')
    const a = first.end
    const b = second.end
    if (a.device.id === b.device.id) return refuse('sameDevice')

    const fit = this.checkFit(request.cable, a, b)
    if (!fit.ok) return fit
    for (const end of [a, b]) {
      if (this.isTaken(state, end, ignoreLinkId)) return refuse('portInUse', end.side)
    }
    if (request.cable === 'console' && isEndDeviceKind(a.device.kind) === isEndDeviceKind(b.device.kind)) {
      return refuse('consoleNeedsTerminal')
    }
    if (request.cable === 'wireless' && request.ssid.trim() === '') return refuse('ssidRequired')
    if (request.cable === 'copperStraight' || request.cable === 'copperCross') {
      return this.checkPinouts(request.cable, a, b)
    }
    return OK
  }

  /** An existing link of the state (its own reservation of the two ports is ignored). */
  validateLink(state: NetworkState, link: Link): CableCheck {
    return this.check(state, link, link.id)
  }

  /**
   * Can this single port take `cable` right now? For highlighting usable ports while the cable
   * tool is active. Checks existence, connector fit and whether the port is free.
   */
  checkEnd(state: NetworkState, end: LinkEnd, cable: CableType, ignoreLinkId?: string): CableCheck {
    const resolved = this.resolve(state, end, 'a')
    if (!resolved.ok) return refuse(resolved.reason)
    const { port } = resolved.end
    if (port.medium !== CABLE_MEDIUM[cable]) return refuse('cableDoesNotFitPort')
    if (cable === 'wireless' && port.role !== 'host' && port.role !== 'radio') {
      return refuse('wirelessNeedsClientAndRadio')
    }
    return this.isTaken(state, resolved.end, ignoreLinkId) ? refuse('portInUse') : OK
  }

  /**
   * The textbook cable for two ports ("auto" tool): straight-through between MDI and MDI-X,
   * crossover between equal pinouts, otherwise the cable of the shared medium. null when the
   * ports cannot be joined by any cable. Serial links default to `dceEnd: 'a'` (first click).
   * Does not check whether the ports are free; call `check` afterwards.
   */
  autoCable(state: NetworkState, endA: LinkEnd, endB: LinkEnd): CableType | null {
    const first = this.resolve(state, endA, 'a')
    const second = this.resolve(state, endB, 'b')
    if (!first.ok || !second.ok || first.end.device.id === second.end.device.id) return null
    const a = first.end
    const b = second.end
    if (a.port.medium !== b.port.medium) return null
    switch (a.port.medium) {
      case 'copper':
        if (this.alwaysStraight(a, b)) return 'copperStraight'
        return this.pinoutOf(a.device, a.port) === this.pinoutOf(b.device, b.port) ? 'copperCross' : 'copperStraight'
      case 'wireless':
        return this.checkFit('wireless', a, b).ok ? 'wireless' : null
      case 'fiber':
      case 'serial':
      case 'console':
      case 'coaxial':
        return a.port.medium
    }
  }

  /**
   * Copper wiring of a port: its explicit `pinout`, else MDI-X on switches, hubs, the cloud and
   * the switched (LAN) ports of a wireless router, MDI everywhere else.
   */
  pinoutOf(device: Device, port: Port): CopperPinout {
    if (port.pinout !== undefined) return port.pinout
    if (MDIX_KINDS.includes(device.kind)) return 'mdix'
    return device.kind === 'wirelessRouter' && port.role === 'switched' ? 'mdix' : 'mdi'
  }

  /**
   * An access point is cabled straight-through to anything, router included (lab rule, research
   * §1.7): it is wired like an end device on a patch cable. Its port stays MDI in
   * `pinoutOf` so an AP to a switch is still straight by the pinout rule.
   */
  private alwaysStraight(a: ResolvedEnd, b: ResolvedEnd): boolean {
    return a.device.kind === 'accessPoint' || b.device.kind === 'accessPoint'
  }

  private resolve(state: NetworkState, end: LinkEnd, side: LinkSide): Resolution {
    const device = state.devices.find((candidate) => candidate.id === end.deviceId)
    if (!device) return { ok: false, reason: 'unknownDevice' }
    const port = device.ports.find((candidate) => candidate.id === end.portId)
    if (!port) return { ok: false, reason: 'unknownPort' }
    return { ok: true, end: { side, device, port } }
  }

  private checkFit(cable: CableType, a: ResolvedEnd, b: ResolvedEnd): CableCheck {
    if (cable === 'wireless') {
      const bothWireless = a.port.medium === 'wireless' && b.port.medium === 'wireless'
      const roles = [a.port.role, b.port.role].sort().join('+')
      return bothWireless && roles === 'host+radio' ? OK : refuse('wirelessNeedsClientAndRadio')
    }
    for (const end of [a, b]) {
      if (end.port.medium !== CABLE_MEDIUM[cable]) return refuse('cableDoesNotFitPort', end.side)
    }
    return OK
  }

  private isTaken(state: NetworkState, end: ResolvedEnd, ignoreLinkId: string | undefined): boolean {
    if (end.port.role === 'radio') return false
    return state.links.some(
      (link) =>
        link.id !== ignoreLinkId &&
        [link.a, link.b].some((linkEnd) => linkEnd.deviceId === end.device.id && linkEnd.portId === end.port.id),
    )
  }

  private checkPinouts(cable: 'copperStraight' | 'copperCross', a: ResolvedEnd, b: ResolvedEnd): CableCheck {
    if ((a.port.autoMdix ?? true) || (b.port.autoMdix ?? true)) return OK
    if (this.alwaysStraight(a, b)) return cable === 'copperCross' ? refuse('straightThroughRequired') : OK
    const samePinout = this.pinoutOf(a.device, a.port) === this.pinoutOf(b.device, b.port)
    if (samePinout && cable === 'copperStraight') return refuse('crossoverRequired')
    if (!samePinout && cable === 'copperCross') return refuse('straightThroughRequired')
    return OK
  }
}
