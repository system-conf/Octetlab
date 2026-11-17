/// <reference types="node" />
// The real rasteriser on the real SVG: resvg (the same WebAssembly the Worker bundles) with the bundled
// fonts must turn the Open Graph picture into a 1200×630 PNG within a time the share store's CPU budget
// easily covers, and the text must actually be drawn (the fonts load).
import { readFileSync } from 'node:fs'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { shareTestLab } from '../../../src/features/share/model/testShareLab'
import { OG_FONT_FAMILY, OgImageSvg, type OgImageText } from './OgImageSvg'

const fonts = ['InterBold.ttf', 'InterMedium.ttf'].map((file) => new Uint8Array(readFileSync(new URL(`./fonts/${file}`, import.meta.url))))

beforeAll(async () => {
  await initWasm(readFileSync(new URL('../../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)))
})

function render(text: OgImageText, fontBuffers: Uint8Array[]): { png: Uint8Array; width: number; height: number } {
  const resvg = new Resvg(OgImageSvg.build(shareTestLab(), text), {
    font: { loadSystemFonts: false, fontBuffers, defaultFontFamily: OG_FONT_FAMILY },
    fitTo: { mode: 'original' },
  })
  const image = resvg.render()
  const result = { png: image.asPng(), width: image.width, height: image.height }
  image.free()
  resvg.free()
  return result
}

describe('Open Graph PNG', () => {
  it('rasterises the share picture with Turkish text to a 1200×630 PNG', () => {
    const started = performance.now()
    const { png, width, height } = render({ title: 'Ofis güvenlik duvarının arkasında: İç ağ, DMZ ve şube', author: 'Çağrı Öztürk' }, fonts)
    const elapsed = performance.now() - started
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(width).toBe(1200)
    expect(height).toBe(630)
    expect(png.byteLength).toBeLessThan(400_000)
    expect(elapsed).toBeLessThan(5_000)
  })

  it('draws the text with the bundled fonts (the picture differs from one rendered without them)', () => {
    const text = { title: 'Cafe network', author: 'Ada' }
    const withFonts = render(text, fonts).png
    const withoutFonts = render(text, []).png
    expect(Buffer.from(withFonts).equals(Buffer.from(withoutFonts))).toBe(false)
  })
})
