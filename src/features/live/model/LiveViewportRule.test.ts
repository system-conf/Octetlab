import { describe, expect, it } from 'vitest'
import { liveLab } from '../../../live/testLiveFakes'
import { LiveHighlightCss, cssString } from './LiveHighlightCss'
import { LiveViewportRule } from './LiveViewportRule'

describe('LiveViewportRule', () => {
  const wide = { x: -100, y: -100, width: 2000, height: 1000 }

  it('converts the viewport to the visible flow rectangle', () => {
    expect(LiveViewportRule.visibleRect({ x: -100, y: 50, zoom: 2 }, 800, 600)).toEqual({ x: 50, y: -25, width: 400, height: 300 })
    expect(LiveViewportRule.visibleRect({ x: 0, y: 0, zoom: 1 }, 0, 600)).toBeNull()
  })

  it('leaves the first document to the workspace and keeps the view when nothing was added', () => {
    expect(LiveViewportRule.shouldRefit(null, liveLab(), wide)).toBe(false)
    expect(LiveViewportRule.shouldRefit(liveLab(), liveLab(), { x: 0, y: 0, width: 1, height: 1 })).toBe(false)
    expect(LiveViewportRule.shouldRefit(liveLab(), liveLab(['pc']), { x: 0, y: 0, width: 1, height: 1 })).toBe(false)
  })

  it('refits when the first devices appear or a new device is outside the view', () => {
    const all = liveLab().state.devices.map((device) => device.id)
    expect(LiveViewportRule.shouldRefit(liveLab(all), liveLab(), wide)).toBe(true)
    expect(LiveViewportRule.shouldRefit(liveLab(['pc']), liveLab(), wide)).toBe(false)
    expect(LiveViewportRule.shouldRefit(liveLab(['pc']), liveLab(), { x: 500, y: 0, width: 300, height: 300 })).toBe(true)
    expect(LiveViewportRule.shouldRefit(liveLab(['pc']), liveLab(), null)).toBe(true)
  })
})

describe('LiveHighlightCss', () => {
  it('is empty without ids and scopes node and cable rules to the live screen', () => {
    expect(LiveHighlightCss.build([], [], true)).toBe('')
    const css = LiveHighlightCss.build(['pc'], ['link1'], true)
    expect(css).toContain('[data-live-lab] .react-flow__node[data-id="pc"]')
    expect(css).toContain('[data-live-lab] .react-flow__edge[data-id="link1"] .react-flow__edge-path')
    expect(css).toContain('@keyframes liveLabPulse')
  })

  it('stays steady with reduced motion', () => {
    expect(LiveHighlightCss.build(['pc'], [], false)).not.toContain('animation')
  })

  it('escapes ids so they cannot leave the attribute value or the style element', () => {
    expect(cssString('a"b\\c')).toBe('a\\"b\\\\c')
    expect(cssString('</style><script>')).not.toContain('<')
  })
})
