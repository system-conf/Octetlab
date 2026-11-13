import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { END_DEVICE_KINDS, type DeviceKind } from '../../domain'
import { deviceCatalog, findDeviceModel } from '../DeviceCatalog'
import { DEVICE_ICON_ART, DEVICE_ICON_IDS } from './deviceIconArt'
import { deviceIconFor, deviceIconForModel, deviceIconRegistry, FALLBACK_DEVICE_ICON, modelIconOverrides } from './deviceIconRegistry'
import type { DeviceIconId } from './deviceIconTypes'
import { DeviceIconGlyph, DeviceKindIcon } from './DeviceKindIcon'
import { arrowPath, doubleArrowPath } from './iconGeometry'

/** Every DeviceKind (the record type forces a key for each one). */
const ALL_KINDS: Readonly<Record<DeviceKind, true>> = {
  internet: true,
  router: true,
  wirelessRouter: true,
  switch: true,
  l3Switch: true,
  hub: true,
  accessPoint: true,
  pc: true,
  laptop: true,
  server: true,
  printer: true,
  ipPhone: true,
  pos: true,
  camera: true,
  nvr: true,
  kitchenDisplay: true,
  smartphone: true,
  tablet: true,
  firewall: true,
}
const KINDS = Object.keys(ALL_KINDS) as DeviceKind[]

function markupOf(icon: DeviceIconId): string {
  return renderToStaticMarkup(<DeviceIconGlyph icon={icon} />)
}

describe('device icon set', () => {
  it.each(DEVICE_ICON_IDS)('%s renders a 24×24 svg in currentColor with a tinted body', (icon) => {
    const markup = markupOf(icon)
    expect(markup).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/)
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('class="deviceIcon"')
    expect(markup).toContain('class="deviceIconBody"')
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })

  it('gives every icon its own drawing', () => {
    expect(new Set(DEVICE_ICON_IDS.map(markupOf)).size).toBe(DEVICE_ICON_IDS.length)
  })

  it('colours icons by category', () => {
    const toneOf = (icon: DeviceIconId) => DEVICE_ICON_ART[icon].tone
    for (const icon of ['router', 'switch', 'l3Switch', 'hub', 'accessPoint', 'wirelessRouter'] as const) expect(toneOf(icon)).toBe('network')
    for (const icon of ['internetCloud', 'dslModem', 'cableModem'] as const) expect(toneOf(icon)).toBe('wan')
    expect(toneOf('firewall')).toBe('security')
    for (const kind of END_DEVICE_KINDS) expect(toneOf(deviceIconFor(kind)), kind).toBe('endDevice')
  })
})

describe('deviceIconRegistry', () => {
  it('has an icon for every device kind', () => {
    expect(Object.keys(deviceIconRegistry).sort()).toEqual([...KINDS].sort())
    for (const kind of KINDS) expect(DEVICE_ICON_IDS).toContain(deviceIconFor(kind))
  })

  it('gives each kind its own icon', () => {
    expect(new Set(KINDS.map(deviceIconFor)).size).toBe(KINDS.length)
  })

  it('resolves an icon for every catalog model', () => {
    for (const model of deviceCatalog) {
      const icon = deviceIconForModel(model.kind, model.id)
      expect(DEVICE_ICON_IDS, model.id).toContain(icon)
      expect(icon, model.id).not.toBe(FALLBACK_DEVICE_ICON)
    }
  })

  it('only overrides models that exist in the catalog, with an icon of the same category', () => {
    for (const [modelId, icon] of Object.entries(modelIconOverrides)) {
      const model = findDeviceModel(modelId)
      expect(model, modelId).toBeDefined()
      expect(DEVICE_ICON_IDS).toContain(icon)
    }
  })

  it('resolves model → kind → fallback', () => {
    expect(deviceIconForModel('kitchenDisplay', 'smartTv')).toBe('smartTv')
    expect(deviceIconForModel('wirelessRouter', 'dslModem')).toBe('dslModem')
    expect(deviceIconForModel('kitchenDisplay', 'kitchenDisplay')).toBe('kitchenDisplay')
    expect(deviceIconForModel('pc', undefined)).toBe('pc')
    expect(deviceIconForModel('router', 'unknownModel')).toBe('router')
    expect(deviceIconForModel('router', 'toString')).toBe('router')
    expect(deviceIconFor('toaster' as DeviceKind)).toBe(FALLBACK_DEVICE_ICON)
  })
})

describe('DeviceKindIcon', () => {
  it('draws the model icon when a modelId is given (smart TV is not a kitchen display)', () => {
    const tv = renderToStaticMarkup(<DeviceKindIcon kind="kitchenDisplay" modelId="smartTv" />)
    expect(tv).toBe(markupOf('smartTv'))
    expect(tv).not.toBe(renderToStaticMarkup(<DeviceKindIcon kind="kitchenDisplay" />))
  })

  it('passes className and aria props, and tones by category unless told to inherit', () => {
    const markup = renderToStaticMarkup(<DeviceKindIcon kind="router" className="h-6 w-6" aria-hidden="true" />)
    expect(markup).toContain('class="deviceIcon h-6 w-6"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('data-tone="network"')
    expect(renderToStaticMarkup(<DeviceKindIcon kind="router" tone="inherit" />)).not.toContain('data-tone')
  })
})

describe('iconGeometry', () => {
  it('draws an arrow with a symmetric head at the tip', () => {
    expect(arrowPath([0, 0], [10, 0], 2, 1)).toBe('M0 0L10 0M8 1L10 0L8 -1')
    expect(doubleArrowPath([0, 0], [10, 0], 2, 1)).toBe('M0 0L10 0M8 1L10 0L8 -1M2 -1L0 0L2 1')
  })

  it('refuses a zero-length arrow', () => {
    expect(() => arrowPath([1, 1], [1, 1])).toThrow()
  })
})
