import { describe, expect, it } from 'vitest'
import { HISTORY_SIZE } from '../cli/core/CliHistory'
import { FILTER_PROTOCOLS } from '../features/simulation/model/EventFilters'
import { DEFAULT_PREFERENCES, DEVICE_STYLES, EVENT_FILTER_PROTOCOLS, preferencesSchema } from './preferencesModel'

describe('preferences model', () => {
  it('has defaults the strict schema accepts', () => {
    expect(preferencesSchema.parse(DEFAULT_PREFERENCES)).toEqual(DEFAULT_PREFERENCES)
  })

  it('defaults to today\'s behaviour', () => {
    expect(DEFAULT_PREFERENCES.appearance.theme).toBe('light')
    expect(DEFAULT_PREFERENCES.map.snap).toBe(false)
    expect(DEFAULT_PREFERENCES.map.deviceStyle).toBe('simple')
    expect(DEFAULT_PREFERENCES.simulation.defaultMode).toBe('realtime')
    expect(DEFAULT_PREFERENCES.simulation.speed).toBe(1)
    expect(DEFAULT_PREFERENCES.terminal.historyLength).toBe(HISTORY_SIZE)
  })

  it('lists the same event-filter protocols as the event list, in chip order', () => {
    expect([...EVENT_FILTER_PROTOCOLS]).toEqual([...FILTER_PROTOCOLS])
    expect(DEFAULT_PREFERENCES.simulation.defaultEventFilters).toEqual(FILTER_PROTOCOLS)
  })

  it('rejects values outside the allowed sets', () => {
    const bad = { ...DEFAULT_PREFERENCES, appearance: { ...DEFAULT_PREFERENCES.appearance, fontScale: 3 } }
    expect(preferencesSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts every device style and nothing else', () => {
    for (const deviceStyle of DEVICE_STYLES) {
      const record = { ...DEFAULT_PREFERENCES, map: { ...DEFAULT_PREFERENCES.map, deviceStyle } }
      expect(preferencesSchema.safeParse(record).success).toBe(true)
    }
    const bad = { ...DEFAULT_PREFERENCES, map: { ...DEFAULT_PREFERENCES.map, deviceStyle: 'cartoon' } }
    expect(preferencesSchema.safeParse(bad).success).toBe(false)
  })
})
