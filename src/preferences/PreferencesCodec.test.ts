import { describe, expect, it, vi } from 'vitest'
import { PREFERENCES_FILE_KIND, PreferencesCodec } from './PreferencesCodec'
import { DEFAULT_PREFERENCES, PREFERENCES_VERSION } from './preferencesModel'

describe('PreferencesCodec', () => {
  it('gives the defaults for nothing, junk or an empty object', () => {
    expect(PreferencesCodec.parse(undefined).preferences).toEqual(DEFAULT_PREFERENCES)
    expect(PreferencesCodec.parse('dark').preferences).toEqual(DEFAULT_PREFERENCES)
    expect(PreferencesCodec.parse([1, 2]).preferences).toEqual(DEFAULT_PREFERENCES)
    expect(PreferencesCodec.parse({}).ignored).toEqual([])
    expect(PreferencesCodec.parseStored(null).preferences).toBe(DEFAULT_PREFERENCES)
  })

  it('keeps the valid fields and lists the invalid ones', () => {
    const { preferences, ignored } = PreferencesCodec.parse({
      version: PREFERENCES_VERSION,
      appearance: { theme: 'dark', fontScale: 7, density: 'compact' },
      map: { snap: 'yes', grid: false, unknownField: 1 },
      terminal: 'big',
      simulation: { defaultEventFilters: ['dns', 'arp', 'dns'] },
    })
    expect(preferences.appearance).toEqual({ ...DEFAULT_PREFERENCES.appearance, theme: 'dark', density: 'compact' })
    expect(preferences.map).toEqual({ ...DEFAULT_PREFERENCES.map, grid: false })
    expect(preferences.terminal).toEqual(DEFAULT_PREFERENCES.terminal)
    expect(preferences.simulation.defaultEventFilters).toEqual(['arp', 'dns'])
    expect(ignored).toEqual(['appearance.fontScale', 'map.snap', 'terminal'])
  })

  it('keeps fields of a newer version it knows', () => {
    const { preferences } = PreferencesCodec.parse({ version: 99, map: { minimap: false }, futureSection: {} })
    expect(preferences.map.minimap).toBe(false)
  })

  it('stores only the fields that differ from the defaults', () => {
    const changed = PreferencesCodec.apply(DEFAULT_PREFERENCES, { map: { snap: true }, terminal: { fontSize: 15 } })
    expect(JSON.parse(PreferencesCodec.toStored(changed))).toEqual({
      version: PREFERENCES_VERSION,
      map: { snap: true },
      terminal: { fontSize: 15 },
    })
    expect(PreferencesCodec.overrides(DEFAULT_PREFERENCES)).toEqual({})
  })

  it('stores, reads back and leniently drops the device style', () => {
    const changed = PreferencesCodec.apply(DEFAULT_PREFERENCES, { map: { deviceStyle: 'classic' } })
    expect(JSON.parse(PreferencesCodec.toStored(changed))).toEqual({ version: PREFERENCES_VERSION, map: { deviceStyle: 'classic' } })
    expect(PreferencesCodec.parseStored(PreferencesCodec.toStored(changed)).preferences.map.deviceStyle).toBe('classic')
    const { preferences, ignored } = PreferencesCodec.parse({ version: PREFERENCES_VERSION, map: { deviceStyle: 'pixel', grid: false } })
    expect(preferences.map).toEqual({ ...DEFAULT_PREFERENCES.map, grid: false })
    expect(ignored).toEqual(['map.deviceStyle'])
  })

  it('stores, reads back and leniently drops the palette layout', () => {
    const changed = PreferencesCodec.apply(DEFAULT_PREFERENCES, { appearance: { paletteLayout: 'bottomBar' } })
    expect(JSON.parse(PreferencesCodec.toStored(changed))).toEqual({ version: PREFERENCES_VERSION, appearance: { paletteLayout: 'bottomBar' } })
    expect(PreferencesCodec.parseStored(PreferencesCodec.toStored(changed)).preferences.appearance.paletteLayout).toBe('bottomBar')
    const { preferences, ignored } = PreferencesCodec.parse({ version: PREFERENCES_VERSION, appearance: { paletteLayout: 'floating', theme: 'dark' } })
    expect(preferences.appearance).toEqual({ ...DEFAULT_PREFERENCES.appearance, theme: 'dark' })
    expect(ignored).toEqual(['appearance.paletteLayout'])
  })

  it('round-trips through the stored text', () => {
    const changed = PreferencesCodec.apply(DEFAULT_PREFERENCES, { appearance: { theme: 'system', highContrast: true } })
    expect(PreferencesCodec.parseStored(PreferencesCodec.toStored(changed)).preferences).toEqual(changed)
  })

  it('warns and uses the defaults for stored text that is not JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(PreferencesCodec.parseStored('{oops').preferences).toEqual(DEFAULT_PREFERENCES)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('exports a complete file and imports it back', () => {
    const changed = PreferencesCodec.apply(DEFAULT_PREFERENCES, { data: { autosave: false } })
    const file = PreferencesCodec.toExportFile(changed)
    expect(JSON.parse(file)).toMatchObject({ kind: PREFERENCES_FILE_KIND, version: PREFERENCES_VERSION, map: DEFAULT_PREFERENCES.map })
    expect(PreferencesCodec.fromImportFile(file)).toEqual({ ok: true, preferences: changed, ignored: [] })
  })

  it('refuses files that are not preferences', () => {
    expect(PreferencesCodec.fromImportFile('not json')).toEqual({ ok: false, reason: 'invalidJson' })
    expect(PreferencesCodec.fromImportFile('[]')).toEqual({ ok: false, reason: 'notPreferences' })
    expect(PreferencesCodec.fromImportFile('{"devices":[]}')).toEqual({ ok: false, reason: 'notPreferences' })
    expect(PreferencesCodec.fromImportFile('{"kind":"lab","map":{}}')).toEqual({ ok: false, reason: 'notPreferences' })
    expect(PreferencesCodec.fromImportFile('{"map":{"grid":false}}')).toMatchObject({ ok: true })
  })

  it('reads and sets single paths', () => {
    expect(PreferencesCodec.get(DEFAULT_PREFERENCES, 'map.portLabels')).toBe('always')
    const next = PreferencesCodec.apply(DEFAULT_PREFERENCES, PreferencesCodec.patchOf('cables.autoCable', false))
    expect(PreferencesCodec.get(next, 'cables.autoCable')).toBe(false)
  })

  it('throws on an invalid value (programmer error)', () => {
    const patch = { appearance: { theme: 'sepia' } } as unknown as Parameters<typeof PreferencesCodec.apply>[1]
    expect(() => PreferencesCodec.apply(DEFAULT_PREFERENCES, patch)).toThrow(/appearance\.theme/)
  })

  it('reuses unchanged sections and returns the same object for no change', () => {
    expect(PreferencesCodec.apply(DEFAULT_PREFERENCES, { map: { snap: false } })).toBe(DEFAULT_PREFERENCES)
    const next = PreferencesCodec.apply(DEFAULT_PREFERENCES, { map: { snap: true } })
    expect(next.map).not.toBe(DEFAULT_PREFERENCES.map)
    expect(next.simulation).toBe(DEFAULT_PREFERENCES.simulation)
    expect(next.simulation.defaultEventFilters).toBe(DEFAULT_PREFERENCES.simulation.defaultEventFilters)
  })
})
