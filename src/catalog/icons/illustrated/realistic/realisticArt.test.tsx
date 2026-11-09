import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEVICE_ICON_IDS } from '../../deviceIconArt'
import type { DeviceIconId } from '../../deviceIconTypes'
import { REALISTIC_ART } from './realisticArt'
import { RealisticIconDefs } from './RealisticIconDefs'

function markupOf(icon: DeviceIconId): string {
  return renderToStaticMarkup(<svg viewBox="0 0 64 64">{REALISTIC_ART[icon]}</svg>)
}

function definedIds(): Set<string> {
  const defs = renderToStaticMarkup(<svg>{RealisticIconDefs()}</svg>)
  return new Set(Array.from(defs.matchAll(/ id="([^"]+)"/g), (match) => match[1] ?? ''))
}

describe('REALISTIC_ART', () => {
  it('has a picture for every device icon and nothing else', () => {
    expect(Object.keys(REALISTIC_ART).sort()).toEqual([...DEVICE_ICON_IDS].sort())
  })

  it('renders every picture as SVG shapes', () => {
    for (const icon of DEVICE_ICON_IDS) {
      const markup = markupOf(icon)
      expect(markup, icon).toMatch(/<(rect|polygon|path|circle|ellipse)\b/)
      expect(markup, icon).not.toContain('undefined')
    }
  })

  it('gives every device its own picture', () => {
    const markups = DEVICE_ICON_IDS.map(markupOf)
    expect(new Set(markups).size).toBe(DEVICE_ICON_IDS.length)
  })

  it('only references gradients that RealisticIconDefs defines', () => {
    const ids = definedIds()
    for (const icon of DEVICE_ICON_IDS) {
      for (const match of markupOf(icon).matchAll(/url\(#([^)]+)\)/g)) {
        expect(ids.has(match[1] ?? ''), `${icon} uses #${match[1]}`).toBe(true)
      }
    }
  })
})

describe('RealisticIconDefs', () => {
  it('wraps the gradients in <defs> and prefixes every id', () => {
    const defs = renderToStaticMarkup(<svg>{RealisticIconDefs()}</svg>)
    expect(defs).toContain('<defs>')
    const ids = definedIds()
    expect(ids.size).toBeGreaterThan(0)
    for (const id of ids) expect(id.startsWith('octetRealistic'), id).toBe(true)
  })
})
