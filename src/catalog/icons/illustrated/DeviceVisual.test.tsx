import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEVICE_STYLES, PreferencesProvider, PreferencesStore, type DeviceStyle } from '../../../preferences'
import { memoryStorage } from '../../../preferences/testStorage'
import { DEVICE_ICON_IDS } from '../deviceIconArt'
import { DeviceKindIcon } from '../DeviceKindIcon'
import { DeviceIllustration, ILLUSTRATION_SETS } from './DeviceIllustration'
import { DeviceVisual } from './DeviceVisual'
import { IllustratedIconDefs } from './IllustratedIconDefs'

function renderWithStyle(deviceStyle: DeviceStyle, element: ReactElement): string {
  const store = new PreferencesStore(memoryStorage())
  store.set('map.deviceStyle', deviceStyle)
  return renderToStaticMarkup(<PreferencesProvider store={store}>{element}</PreferencesProvider>)
}

describe('illustration sets', () => {
  it('have a picture for every device icon in both styles', () => {
    for (const set of Object.values(ILLUSTRATION_SETS)) {
      expect(Object.keys(set).sort()).toEqual([...DEVICE_ICON_IDS].sort())
    }
  })
})

describe('DeviceIllustration', () => {
  it('draws on a 64 × 64 grid and passes size, class and aria props', () => {
    const markup = renderToStaticMarkup(<DeviceIllustration icon="router" style="realistic" size={40} className="h-10 w-10" aria-hidden="true" />)
    expect(markup).toMatch(/^<svg[^>]*viewBox="0 0 64 64"/)
    expect(markup).toContain('width="40"')
    expect(markup).toContain('data-device-style="realistic"')
    expect(markup).toContain('class="h-10 w-10"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('role="img"')
    expect(renderToStaticMarkup(<DeviceIllustration icon="pc" style="classic" aria-label="PC" />)).toContain('role="img"')
  })
})

describe('DeviceVisual', () => {
  it('looks exactly like DeviceKindIcon in the simple style (the default)', () => {
    const store = new PreferencesStore(memoryStorage())
    const visual = renderToStaticMarkup(
      <PreferencesProvider store={store}>
        <DeviceVisual kind="router" className="h-7 w-7" illustrationClassName="h-14 w-14" aria-hidden="true" />
      </PreferencesProvider>,
    )
    expect(visual).toBe(renderToStaticMarkup(<DeviceKindIcon kind="router" className="h-7 w-7" aria-hidden="true" />))
    const offTone = renderWithStyle('simple', <DeviceVisual kind="pc" tone="inherit" />)
    expect(offTone).toBe(renderToStaticMarkup(<DeviceKindIcon kind="pc" tone="inherit" />))
  })

  it.each(['classic', 'realistic'] as const)('draws the %s picture of the model, with the picture class', (deviceStyle) => {
    const markup = renderWithStyle(deviceStyle, <DeviceVisual kind="kitchenDisplay" modelId="smartTv" className="h-7 w-7" illustrationClassName="h-14 w-14" aria-hidden="true" />)
    expect(markup).toBe(renderToStaticMarkup(<DeviceIllustration icon="smartTv" style={deviceStyle} className="h-14 w-14" aria-hidden="true" />))
  })

  it('falls back to the icon class when no picture class is given', () => {
    expect(renderWithStyle('classic', <DeviceVisual kind="pc" className="h-6 w-6" />)).toContain('class="h-6 w-6"')
  })

  it('lets an explicit style win over the preference', () => {
    const markup = renderWithStyle('realistic', <DeviceVisual kind="switch" deviceStyle="simple" />)
    expect(markup).toBe(renderToStaticMarkup(<DeviceKindIcon kind="switch" />))
  })

  it('covers every preference value', () => {
    for (const deviceStyle of DEVICE_STYLES) {
      const markup = renderWithStyle(deviceStyle, <DeviceVisual kind="router" />)
      expect(markup).toContain(deviceStyle === 'simple' ? 'viewBox="0 0 24 24"' : `data-device-style="${deviceStyle}"`)
    }
  })
})

describe('IllustratedIconDefs', () => {
  it('is a zero-size, hidden-from-readers svg that still renders (no display:none)', () => {
    const markup = renderToStaticMarkup(<IllustratedIconDefs />)
    expect(markup).toMatch(/^<svg[^>]*width="0" height="0"/)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('position:absolute')
    expect(markup).not.toContain('display')
  })
})
