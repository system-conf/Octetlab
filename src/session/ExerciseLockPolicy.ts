// What an exercise lab lets the learner change (MODEL_V2 §10 `ExerciseLock`). Anything not locked is
// editable; the strictest lock wins (hidden > readOnly > editable). A free lab uses `none`.
import type { Device, DeviceSection, ExerciseLock, Link, LockAccess, NetworkState } from '../domain'

export type EditAccess = 'editable' | LockAccess

export interface DeletionRequest {
  deviceIds: readonly string[]
  linkIds: readonly string[]
  annotationIds: readonly string[]
}

const STRICTNESS: Readonly<Record<EditAccess, number>> = { editable: 0, readOnly: 1, hidden: 2 }

/** The strictest of the given accesses ('editable' when none is given). The only lock ranking. */
export function strictest(...accesses: EditAccess[]): EditAccess {
  return accesses.reduce<EditAccess>((worst, access) => (STRICTNESS[access] > STRICTNESS[worst] ? access : worst), 'editable')
}

/** Structural equality of plain JSON-like data (key order does not matter). */
function sameData(first: unknown, second: unknown): boolean {
  if (first === second) return true
  if (typeof first !== 'object' || typeof second !== 'object' || first === null || second === null) return false
  if (Array.isArray(first) !== Array.isArray(second)) return false
  const firstRecord = first as Record<string, unknown>
  const secondRecord = second as Record<string, unknown>
  const keys = new Set([...Object.keys(firstRecord), ...Object.keys(secondRecord)])
  return [...keys].every((key) => sameData(firstRecord[key], secondRecord[key]))
}

/** Device data each lockable section covers ('terminal' covers no data: it is the command prompt). */
const SECTION_DATA: Readonly<Record<Exclude<DeviceSection, 'terminal'>, (device: Device) => unknown>> = {
  power: (device) => device.powered,
  ports: (device) => device.ports,
  host: (device) => device.host,
  switching: (device) => device.switching,
  routing: (device) => device.routing,
  wireless: (device) => device.wireless,
  services: (device) => device.services,
  internet: (device) => device.internet,
  security: (device) => {
    const management = device.features?.management
    return [device.features?.accessLists, device.features?.nat, management?.users, management?.ssh, management?.domainName]
  },
}

export class ExerciseLockPolicy {
  /** A free lab: nothing locked. */
  static readonly none = new ExerciseLockPolicy([], [])

  /**
   * Live labs (docs/LIVE_LABS.md §8): a lab that is only watched. Every device is read-only, the
   * topology and every cable are locked, and the notes on the map and the lab notes are locked too.
   */
  static readOnlyLab(state: NetworkState): ExerciseLockPolicy {
    const locks: ExerciseLock[] = [
      { scope: 'topology' },
      ...state.devices.map((device): ExerciseLock => ({ scope: 'device', deviceId: device.id, access: 'readOnly' })),
      ...state.links.map((link): ExerciseLock => ({ scope: 'link', linkId: link.id })),
    ]
    return new ExerciseLockPolicy(locks, state.links, { annotationsLocked: true })
  }

  readonly locks: readonly ExerciseLock[]
  /** Live labs: map notes and lab notes cannot be added, edited, moved or deleted either. */
  readonly annotationsLocked: boolean
  /** Devices at either end of a locked link: deleting one would delete the link with it. */
  private readonly lockedLinkDevices: ReadonlySet<string>

  /**
   * `links`: the links of the exercise's starting lab. Locked links can be neither deleted nor rewired,
   * so their ends stay the devices they connect there.
   */
  constructor(locks: readonly ExerciseLock[], links: readonly Link[], options: { annotationsLocked?: boolean } = {}) {
    this.locks = locks
    this.annotationsLocked = options.annotationsLocked ?? false
    const locked = new Set(locks.flatMap((lock) => (lock.scope === 'link' ? [lock.linkId] : [])))
    this.lockedLinkDevices = new Set(links.filter((link) => locked.has(link.id)).flatMap((link) => [link.a.deviceId, link.b.deviceId]))
  }

  get hasLocks(): boolean {
    return this.locks.length > 0
  }

  /** No devices or cables may be added, deleted or moved (palette, cable tool, delete, drag). */
  get topologyLocked(): boolean {
    return this.locks.some((lock) => lock.scope === 'topology')
  }

  /**
   * Design (D2): a `placement` lock pins a customer device (moving, cabling and settings stay free). A
   * device at either end of a locked link stays as well: deleting it would delete the link.
   */
  canDeleteDevice(deviceId: string): boolean {
    if (this.topologyLocked || this.lockedLinkDevices.has(deviceId)) return false
    return !this.locks.some((lock) => lock.scope === 'placement' && lock.deviceId === deviceId)
  }

  canDeleteLink(linkId: string): boolean {
    return !this.topologyLocked && !this.linkLocked(linkId)
  }

  /** Plugging / unplugging keeps the cable, so only a link lock forbids it. */
  canUnplugLink(linkId: string): boolean {
    return !this.linkLocked(linkId)
  }

  deviceAccess(deviceId: string): EditAccess {
    return strictest(
      ...this.locks.flatMap((lock) => (lock.scope === 'device' && lock.deviceId === deviceId ? [lock.access] : [])),
    )
  }

  sectionAccess(deviceId: string, section: DeviceSection): EditAccess {
    const sectionLocks = this.locks.flatMap((lock) =>
      lock.scope === 'section' && lock.deviceId === deviceId && lock.section === section ? [lock.access] : [],
    )
    return strictest(this.deviceAccess(deviceId), ...sectionLocks)
  }

  /** A port is covered by its own lock, the device's 'ports' section and the device lock. */
  portAccess(deviceId: string, portId: string): EditAccess {
    const portLocks = this.locks.flatMap((lock) =>
      lock.scope === 'port' && lock.deviceId === deviceId && lock.portId === portId ? [lock.access] : [],
    )
    return strictest(this.sectionAccess(deviceId, 'ports'), ...portLocks)
  }

  /** The command prompt can be used only when the 'terminal' section is editable. */
  canUseTerminal(deviceId: string): boolean {
    return this.sectionAccess(deviceId, 'terminal') === 'editable'
  }

  /** Safety net under the settings panel: false when `after` changes anything that is locked. */
  allowsDeviceUpdate(before: Device, after: Device): boolean {
    if (before.id !== after.id) return false
    if (this.deviceAccess(before.id) !== 'editable') return sameData(before, after)
    for (const [section, dataOf] of Object.entries(SECTION_DATA)) {
      if (!this.isSection(section)) continue
      if (this.sectionAccess(before.id, section) !== 'editable' && !sameData(dataOf(before), dataOf(after))) return false
    }
    return before.ports.every((port) => {
      if (this.portAccess(before.id, port.id) === 'editable') return true
      return sameData(port, after.ports.find((candidate) => candidate.id === port.id))
    })
  }

  /** The part of a delete request the locks allow (annotations are locked only in a read-only lab). */
  allowedDeletion(request: DeletionRequest): DeletionRequest {
    return {
      deviceIds: request.deviceIds.filter((deviceId) => this.canDeleteDevice(deviceId)),
      linkIds: request.linkIds.filter((linkId) => this.canDeleteLink(linkId)),
      annotationIds: this.annotationsLocked ? [] : request.annotationIds,
    }
  }

  private linkLocked(linkId: string): boolean {
    return this.locks.some((lock) => lock.scope === 'link' && lock.linkId === linkId)
  }

  private isSection(section: string): section is Exclude<DeviceSection, 'terminal'> {
    return section in SECTION_DATA
  }
}
