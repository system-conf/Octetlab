import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreferencesProvider, PreferencesStore } from '../../preferences'
import { memoryStorage } from '../../preferences/testStorage'
import AppearanceSection from './sections/AppearanceSection'
import MapSection from './sections/MapSection'
import SimulationSection from './sections/SimulationSection'
import TerminalSection from './sections/TerminalSection'
import PreferencesView from './PreferencesView'

function render(store: PreferencesStore, element: React.ReactElement): string {
  return renderToString(<PreferencesProvider store={store}>{element}</PreferencesProvider>)
}

describe('PreferencesView', () => {
  it('renders an accessible tab list with one selected tab and its panel', () => {
    const html = render(new PreferencesStore(memoryStorage()), <PreferencesView />)
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)).toHaveLength(7)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/tabindex="0"/g)?.length).toBeGreaterThanOrEqual(1)
    expect(html).toContain('role="tabpanel"')
    // SSR has no media query: the phone layout (a horizontal row) is rendered.
    expect(html).toContain('aria-orientation="horizontal"')
  })

  it('shows the stored map preferences', () => {
    const store = new PreferencesStore(memoryStorage())
    store.update({ map: { deviceLabels: 'model', grid: false } })
    const html = render(store, <MapSection />)
    expect(html).toMatch(/checked="" value="model"/)
    expect(html).not.toMatch(/checked="" value="name"/)
    // Switches: link lights (on), grid (off), snap (off), minimap (on).
    expect(html.match(/role="switch" aria-checked="true"/g)).toHaveLength(2)
    expect(html.match(/role="switch" aria-checked="false"/g)).toHaveLength(2)
  })

  it('offers the device styles with a router, switch and PC preview each', () => {
    const store = new PreferencesStore(memoryStorage())
    store.update({ map: { deviceStyle: 'realistic' } })
    const html = render(store, <MapSection />)
    expect(html).toMatch(/checked="" value="realistic"/)
    expect(html).not.toMatch(/checked="" value="simple"/)
    for (const style of ['simple', 'classic', 'realistic']) expect(html).toContain(`data-device-style-preview="${style}"`)
    expect(html.match(/data-device-style="classic"/g)).toHaveLength(3)
    expect(html.match(/data-device-style="realistic"/g)).toHaveLength(3)
  })

  it('offers the device list layouts with a schematic preview each', () => {
    const store = new PreferencesStore(memoryStorage())
    expect(render(store, <AppearanceSection />)).toMatch(/checked="" value="sidebar"/)
    store.update({ appearance: { paletteLayout: 'bottomBar' } })
    const html = render(store, <AppearanceSection />)
    expect(html).toMatch(/checked="" value="bottomBar"/)
    expect(html).not.toMatch(/checked="" value="sidebar"/)
    for (const layout of ['sidebar', 'bottomBar']) expect(html).toContain(`data-palette-layout-preview="${layout}"`)
  })

  it('shows the start mode and the starting event filters', () => {
    const store = new PreferencesStore(memoryStorage())
    store.update({ simulation: { defaultMode: 'simulation', defaultEventFilters: ['icmp', 'arp'] } })
    const html = render(store, <SimulationSection />)
    expect(html).toMatch(/checked="" value="simulation"/)
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2)
  })

  it('shows the terminal font size and history length', () => {
    const store = new PreferencesStore(memoryStorage())
    store.update({ terminal: { fontSize: 16, historyLength: 42 } })
    const html = render(store, <TerminalSection />)
    expect(html).toContain('value="42"')
    // The select's value is the option index: 16 px is the sixth size from 11 px.
    expect(html).toMatch(/<option value="5" selected="">/)
  })
})
