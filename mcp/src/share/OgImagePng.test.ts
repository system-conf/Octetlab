/// <reference types="node" />
// The real rasteriser on the real SVG: resvg (the same WebAssembly the Worker bundles) must turn the
// Open Graph picture into a 1200×630 PNG within a time the share store's CPU budget easily covers.
import { readFileSync } from 'node:fs'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { shareTestLab } from '../../../src/features/share/model/testShareLab'
import { OgImageSvg } from './OgImageSvg'

beforeAll(async () => {
  await initWasm(readFileSync(new URL('../../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)))
})

describe('Open Graph PNG', () => {
  it('rasterises the share picture to a 1200×630 PNG', () => {
    const started = performance.now()
    const resvg = new Resvg(OgImageSvg.build(shareTestLab()), { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } })
    const image = resvg.render()
    const png = image.asPng()
    const elapsed = performance.now() - started
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(image.width).toBe(1200)
    expect(image.height).toBe(630)
    expect(png.byteLength).toBeLessThan(300_000)
    expect(elapsed).toBeLessThan(5_000)
    image.free()
    resvg.free()
  })
})
