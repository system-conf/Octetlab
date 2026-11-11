import { describe, expect, it } from 'vitest'
import {
  DeviceWindowManager,
  MAX_DEVICE_WINDOWS,
  WINDOW_DEFAULT_SIZE,
  WINDOW_MAX_SIZE,
  WINDOW_MIN_SIZE,
  type WindowArea,
} from './DeviceWindowManager'

type Tab = 'info' | 'cli' | 'terminal'

const AREA: WindowArea = { width: 1200, height: 800 }

function openAll(...deviceIds: string[]): DeviceWindowManager<Tab> {
  return deviceIds.reduce((manager, id) => manager.open(id, 'info', AREA), DeviceWindowManager.empty<Tab>())
}

const ids = (manager: DeviceWindowManager<Tab>) => manager.windows.map((entry) => entry.deviceId)

describe('DeviceWindowManager', () => {
  it('opens windows in front, cascaded, at the default size and with their own tab', () => {
    const manager = DeviceWindowManager.empty<Tab>().open('r1', 'cli', AREA).open('pc1', 'terminal', AREA)
    expect(ids(manager)).toEqual(['r1', 'pc1'])
    expect(manager.activeId).toBe('pc1')
    const [first, second] = manager.windows
    expect(first?.rect).toEqual({ x: 16, y: 16, ...WINDOW_DEFAULT_SIZE })
    expect(second?.rect).toEqual({ x: 44, y: 44, ...WINDOW_DEFAULT_SIZE })
    expect(first?.tab).toBe('cli')
    expect(second?.tab).toBe('terminal')
  })

  it('focuses an open window instead of opening a second one', () => {
    const manager = openAll('r1', 'pc1')
    const again = manager.open('r1', 'terminal', AREA)
    expect(ids(again)).toEqual(['pc1', 'r1'])
    expect(again.size).toBe(2)
    // The window keeps its tab.
    expect(again.find('r1')?.tab).toBe('info')
    // Already in front: nothing changes.
    expect(again.open('r1', 'info', AREA)).toBe(again)
  })

  it(`keeps at most ${MAX_DEVICE_WINDOWS} windows, closing the one furthest back`, () => {
    const names = Array.from({ length: MAX_DEVICE_WINDOWS }, (_, index) => `d${index}`)
    const full = openAll(...names).focus('d0')
    const next = full.open('extra', 'info', AREA)
    expect(next.size).toBe(MAX_DEVICE_WINDOWS)
    expect(next.find('d1')).toBeUndefined()
    expect(next.find('d0')).toBeDefined()
    expect(next.activeId).toBe('extra')
  })

  it('brings a window to the front and keeps the same manager when it already is', () => {
    const manager = openAll('a', 'b', 'c')
    expect(ids(manager.focus('a'))).toEqual(['b', 'c', 'a'])
    expect(manager.focus('c')).toBe(manager)
    expect(manager.focus('missing')).toBe(manager)
  })

  it('minimises to the dock and restores in front', () => {
    const manager = openAll('a', 'b').minimise('b')
    expect(manager.find('b')?.minimised).toBe(true)
    expect(manager.activeId).toBe('a')
    expect(manager.minimise('b')).toBe(manager)
    const restored = manager.focus('a').restore('b')
    expect(ids(restored)).toEqual(['a', 'b'])
    expect(restored.find('b')?.minimised).toBe(false)
    expect(restored.activeId).toBe('b')
    // Opening a minimised device's window restores it.
    expect(manager.open('b', 'info', AREA).find('b')?.minimised).toBe(false)
  })

  it('has no active window when every window is minimised', () => {
    expect(openAll('a').minimise('a').activeId).toBeNull()
    expect(DeviceWindowManager.empty<Tab>().activeId).toBeNull()
  })

  it('closes windows and drops those of devices that are gone', () => {
    const manager = openAll('a', 'b', 'c')
    expect(ids(manager.close('b'))).toEqual(['a', 'c'])
    expect(manager.close('missing')).toBe(manager)
    expect(ids(manager.retain(new Set(['c', 'x'])))).toEqual(['c'])
    expect(manager.retain(new Set(['a', 'b', 'c']))).toBe(manager)
  })

  it('moves a window but keeps it inside the area', () => {
    const manager = openAll('a')
    expect(manager.move('a', 100, 50, AREA).find('a')?.rect).toMatchObject({ x: 100, y: 50 })
    expect(manager.move('a', -40, -10, AREA).find('a')?.rect).toMatchObject({ x: 0, y: 0 })
    const far = manager.move('a', 5000, 5000, AREA).find('a')?.rect
    expect(far).toMatchObject({ x: AREA.width - WINDOW_DEFAULT_SIZE.width, y: AREA.height - WINDOW_DEFAULT_SIZE.height })
  })

  it('resizes from the corner between the limits and the room left in the area', () => {
    const manager = openAll('a').move('a', 100, 100, AREA)
    expect(manager.resize('a', 700, 500, AREA).find('a')?.rect).toEqual({ x: 100, y: 100, width: 700, height: 500 })
    expect(manager.resize('a', 10, 10, AREA).find('a')?.rect).toMatchObject(WINDOW_MIN_SIZE)
    expect(manager.resize('a', 5000, 5000, AREA).find('a')?.rect).toEqual({ x: 100, y: 100, width: 1100, height: 700 })
    const wide: WindowArea = { width: 3000, height: 2000 }
    expect(manager.resize('a', 5000, 5000, wide).find('a')?.rect).toMatchObject(WINDOW_MAX_SIZE)
  })

  it('fits windows into a smaller area for display and keeps their own rectangles', () => {
    const manager = openAll('a').move('a', 500, 200, AREA)
    const small: WindowArea = { width: 700, height: 400 }
    const [shown] = manager.fitted(small)
    expect(shown?.rect).toEqual({ x: 100, y: 0, width: 600, height: 400 })
    expect(manager.find('a')?.rect).toMatchObject({ x: 500, y: 200 })
    // An area smaller than the minimum size: the window fills it.
    expect(DeviceWindowManager.fit({ x: 50, y: 50, width: 600, height: 500 }, { width: 200, height: 150 })).toEqual({ x: 0, y: 0, width: 200, height: 150 })
    // Unknown area (not measured yet): unchanged.
    expect(manager.fitted(null)).toBe(manager.windows)
  })

  it('keeps one tab per window', () => {
    const manager = openAll('a', 'b').setTab('a', 'cli')
    expect(manager.find('a')?.tab).toBe('cli')
    expect(manager.find('b')?.tab).toBe('info')
    expect(manager.setTab('a', 'cli')).toBe(manager)
  })
})
