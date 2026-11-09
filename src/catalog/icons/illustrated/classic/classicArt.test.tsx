import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEVICE_ICON_IDS } from '../../deviceIconArt'
import type { DeviceIconId } from '../../deviceIconTypes'
import { CLASSIC_ART } from './classicArt'
import { ClassicIconDefs } from './ClassicIconDefs'

function markupOf(icon: DeviceIconId): string {
  return renderToStaticMarkup(<svg viewBox="0 0 64 64">{CLASSIC_ART[icon]}</svg>)
}

const defsMarkup = renderToStaticMarkup(<svg><ClassicIconDefs /></svg>)
const definedIds = new Set([...defsMarkup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))

describe('classic device pictures', () => {
  it('has exactly one picture per device icon', () => {
    expect(Object.keys(CLASSIC_ART).sort()).toEqual([...DEVICE_ICON_IDS].sort())
  })

  it.each(DEVICE_ICON_IDS)('%s renders drawn shapes', (icon) => {
    const markup = markupOf(icon)
    expect(markup).toMatch(/<(path|rect|polygon|circle|ellipse|line)\b/)
    expect(markup).not.toContain('undefined')
    expect(markup).not.toContain('NaN')
  })

  it('gives every device its own drawing', () => {
    expect(new Set(DEVICE_ICON_IDS.map(markupOf)).size).toBe(DEVICE_ICON_IDS.length)
  })

  it('only references gradients defined in ClassicIconDefs', () => {
    expect(defsMarkup).toMatch(/^<svg><defs>/)
    for (const icon of DEVICE_ICON_IDS) {
      for (const [, id] of markupOf(icon).matchAll(/url\(#([^)]+)\)/g)) {
        expect(definedIds, `${icon} uses #${id}`).toContain(id)
      }
    }
  })

  it('prefixes every gradient id with octetClassic', () => {
    expect(definedIds.size).toBeGreaterThan(0)
    for (const id of definedIds) expect(id).toMatch(/^octetClassic[A-Z]/)
  })
})
