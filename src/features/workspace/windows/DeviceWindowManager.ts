// Floating device windows (Preferences → Appearance → device details "in a window"): which are open,
// where, how big, which is in front. Session state only; nothing is stored.

/** The workspace area the windows live in (the canvas), in CSS pixels. */
export interface WindowArea {
  readonly width: number
  readonly height: number
}

/** A window's place inside the area: top-left corner and size, in CSS pixels. */
export interface WindowRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DeviceWindowState<Tab extends string> {
  /** One window per device: the device id is the window's id. */
  readonly deviceId: string
  readonly rect: WindowRect
  /** Minimised windows wait as chips in the dock; they keep their place and tab. */
  readonly minimised: boolean
  /** The device tab this window shows (each window has its own). */
  readonly tab: Tab
}

/** At most this many windows; opening one more closes the one furthest back. */
export const MAX_DEVICE_WINDOWS = 6
export const WINDOW_MIN_SIZE: WindowArea = { width: 320, height: 240 }
export const WINDOW_MAX_SIZE: WindowArea = { width: 1100, height: 900 }
export const WINDOW_DEFAULT_SIZE: WindowArea = { width: 600, height: 560 }
/** Gap of the first window from the area's top-left corner, and the step of each further one. */
const FIRST_OFFSET = 16
const CASCADE_STEP = 28
const CASCADE_STEPS = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * The open device windows, back to front (immutable: every change returns a new manager; a call that
 * changes nothing returns the same one, so React skips the render). Rectangles are kept as the learner
 * left them; `fitted` squeezes them into a smaller area for display, so they come back when it grows.
 */
export class DeviceWindowManager<Tab extends string> {
  private readonly list: readonly DeviceWindowState<Tab>[]

  private constructor(list: readonly DeviceWindowState<Tab>[]) {
    this.list = list
  }

  static empty<Tab extends string>(): DeviceWindowManager<Tab> {
    return new DeviceWindowManager<Tab>([])
  }

  /** A rectangle fitted into `area`: size between the limits (never larger than the area), fully inside it. */
  static fit(rect: WindowRect, area: WindowArea | null): WindowRect {
    if (area === null) return rect
    const maxWidth = Math.min(WINDOW_MAX_SIZE.width, area.width)
    const maxHeight = Math.min(WINDOW_MAX_SIZE.height, area.height)
    const width = clamp(rect.width, Math.min(WINDOW_MIN_SIZE.width, maxWidth), maxWidth)
    const height = clamp(rect.height, Math.min(WINDOW_MIN_SIZE.height, maxHeight), maxHeight)
    return {
      x: clamp(rect.x, 0, Math.max(0, area.width - width)),
      y: clamp(rect.y, 0, Math.max(0, area.height - height)),
      width,
      height,
    }
  }

  /** `rect` moved to (x, y), kept inside the area (a title-bar drag). */
  static moved(rect: WindowRect, x: number, y: number, area: WindowArea | null): WindowRect {
    return DeviceWindowManager.fit({ ...rect, x, y }, area)
  }

  /** `rect` resized from its bottom-right corner; the top-left corner stays unless the area is too small. */
  static resized(rect: WindowRect, width: number, height: number, area: WindowArea | null): WindowRect {
    const room = area === null ? null : { width: Math.max(0, area.width - rect.x), height: Math.max(0, area.height - rect.y) }
    const maxWidth = Math.min(WINDOW_MAX_SIZE.width, room?.width ?? Infinity)
    const maxHeight = Math.min(WINDOW_MAX_SIZE.height, room?.height ?? Infinity)
    const sized = {
      ...rect,
      width: Math.max(WINDOW_MIN_SIZE.width, Math.min(width, maxWidth)),
      height: Math.max(WINDOW_MIN_SIZE.height, Math.min(height, maxHeight)),
    }
    return DeviceWindowManager.fit(sized, area)
  }

  /** The windows, back to front. */
  get windows(): readonly DeviceWindowState<Tab>[] {
    return this.list
  }

  get size(): number {
    return this.list.length
  }

  find(deviceId: string): DeviceWindowState<Tab> | undefined {
    return this.list.find((entry) => entry.deviceId === deviceId)
  }

  /** The front window that is not minimised (it has the focus ring), or null. */
  get activeId(): string | null {
    for (let index = this.list.length - 1; index >= 0; index -= 1) {
      const entry = this.list[index]
      if (entry !== undefined && !entry.minimised) return entry.deviceId
    }
    return null
  }

  /** The windows with their rectangles fitted into `area` (what the screen shows). */
  fitted(area: WindowArea | null): readonly DeviceWindowState<Tab>[] {
    if (area === null) return this.list
    return this.list.map((entry) => this.withRect(entry, DeviceWindowManager.fit(entry.rect, area)))
  }

  /**
   * Opens the device's window in front on `tab`. An open window is brought to the front (and restored)
   * instead of a second one; with all windows taken, the one furthest back closes first.
   */
  open(deviceId: string, tab: Tab, area: WindowArea | null): DeviceWindowManager<Tab> {
    if (this.find(deviceId)) return this.restore(deviceId)
    const kept = this.list.length >= MAX_DEVICE_WINDOWS ? this.list.slice(this.list.length - MAX_DEVICE_WINDOWS + 1) : this.list
    const offset = FIRST_OFFSET + (kept.length % CASCADE_STEPS) * CASCADE_STEP
    const rect = DeviceWindowManager.fit({ x: offset, y: offset, ...WINDOW_DEFAULT_SIZE }, area)
    return new DeviceWindowManager([...kept, { deviceId, rect, minimised: false, tab }])
  }

  /** Brings the window to the front (a click or the focus inside it). */
  focus(deviceId: string): DeviceWindowManager<Tab> {
    const entry = this.find(deviceId)
    if (entry === undefined || this.list[this.list.length - 1] === entry) return this
    return new DeviceWindowManager([...this.list.filter((other) => other !== entry), entry])
  }

  /** Shows a minimised window again, in front. */
  restore(deviceId: string): DeviceWindowManager<Tab> {
    const entry = this.find(deviceId)
    if (entry === undefined) return this
    if (!entry.minimised) return this.focus(deviceId)
    return new DeviceWindowManager([...this.list.filter((other) => other !== entry), { ...entry, minimised: false }])
  }

  minimise(deviceId: string): DeviceWindowManager<Tab> {
    return this.change(deviceId, (entry) => (entry.minimised ? entry : { ...entry, minimised: true }))
  }

  close(deviceId: string): DeviceWindowManager<Tab> {
    if (!this.find(deviceId)) return this
    return new DeviceWindowManager(this.list.filter((entry) => entry.deviceId !== deviceId))
  }

  move(deviceId: string, x: number, y: number, area: WindowArea | null): DeviceWindowManager<Tab> {
    return this.change(deviceId, (entry) => this.withRect(entry, DeviceWindowManager.moved(entry.rect, x, y, area)))
  }

  resize(deviceId: string, width: number, height: number, area: WindowArea | null): DeviceWindowManager<Tab> {
    return this.change(deviceId, (entry) => this.withRect(entry, DeviceWindowManager.resized(entry.rect, width, height, area)))
  }

  setTab(deviceId: string, tab: Tab): DeviceWindowManager<Tab> {
    return this.change(deviceId, (entry) => (entry.tab === tab ? entry : { ...entry, tab }))
  }

  /** Closes the windows of devices that are gone (deleted, undone, another lab). */
  retain(deviceIds: ReadonlySet<string>): DeviceWindowManager<Tab> {
    const kept = this.list.filter((entry) => deviceIds.has(entry.deviceId))
    return kept.length === this.list.length ? this : new DeviceWindowManager(kept)
  }

  private withRect(entry: DeviceWindowState<Tab>, rect: WindowRect): DeviceWindowState<Tab> {
    const same = rect.x === entry.rect.x && rect.y === entry.rect.y && rect.width === entry.rect.width && rect.height === entry.rect.height
    return same ? entry : { ...entry, rect }
  }

  private change(deviceId: string, update: (entry: DeviceWindowState<Tab>) => DeviceWindowState<Tab>): DeviceWindowManager<Tab> {
    let changed = false
    const list = this.list.map((entry) => {
      if (entry.deviceId !== deviceId) return entry
      const next = update(entry)
      changed = next !== entry
      return next
    })
    return changed ? new DeviceWindowManager(list) : this
  }
}
