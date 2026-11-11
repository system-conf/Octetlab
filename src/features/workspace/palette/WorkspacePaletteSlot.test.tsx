import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreferencesProvider, PreferencesStore, type PaletteLayout } from '../../../preferences'
import { memoryStorage } from '../../../preferences/testStorage'
import { deviceCatalog } from '../labServices'
import WorkspacePaletteSlot from './WorkspacePaletteSlot'

function render(layout: PaletteLayout | null, atBottom: boolean): string {
  const store = new PreferencesStore(memoryStorage())
  if (layout !== null) store.update({ appearance: { paletteLayout: layout } })
  return renderToString(
    <PreferencesProvider store={store}>
      <WorkspacePaletteSlot atBottom={atBottom} models={deviceCatalog} onAdd={() => undefined} onChooseCable={() => undefined} activeCable={null} />
    </PreferencesProvider>,
  )
}

describe('WorkspacePaletteSlot', () => {
  it('shows the sidebar palette by default and nothing in the bottom slot', () => {
    const html = render(null, false)
    expect(html).toContain('<aside aria-labelledby="palette-heading"')
    expect(html).toContain('grid grid-cols-3 gap-1 md:grid-cols-2')
    expect(render(null, true)).toBe('')
  })

  it('moves the palette to the bar under the canvas when the preference says so', () => {
    expect(render('bottomBar', false)).toBe('')
    const html = render('bottomBar', true)
    expect(html).toContain('data-palette-layout="bottomBar"')
    // Wide screens only: phones keep the drawer.
    expect(html).toContain('hidden md:contents')
    // Labelled category buttons, the search box, one sideways row of draggable tiles with a tooltip.
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('type="search"')
    expect(html).toContain('class="flex gap-1"')
    expect(html).toMatch(/draggable="true"[^>]*title="/)
    expect(html).not.toContain('<aside')
  })
})
