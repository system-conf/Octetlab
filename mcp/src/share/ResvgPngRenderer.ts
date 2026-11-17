// SVG → PNG with resvg (WebAssembly) inside the ShareStore Durable Object, which has a 30 s CPU budget
// per request (developers.cloudflare.com/durable-objects/platform/limits) — a stateless Worker on the
// Free plan has 10 ms, too little to rasterise. The module is compiled by wrangler at upload time and
// instantiated once per isolate. There are no system fonts in a Worker: the fonts come in as buffers.
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import resvgModule from '@resvg/resvg-wasm/index_bg.wasm'
import { OG_FONT_FAMILY } from './OgImageSvg'
import type { PngRenderer } from './ShareService'

let ready: Promise<void> | null = null

export class ResvgPngRenderer implements PngRenderer {
  private readonly fonts: Uint8Array[]

  /** `fonts`: raw TTF / OTF files of the OG_FONT_FAMILY family. */
  constructor(fonts: Uint8Array[]) {
    this.fonts = fonts
  }

  async render(svg: string): Promise<Uint8Array> {
    ready ??= initWasm(resvgModule).catch((error: unknown) => {
      ready = null
      throw error
    })
    await ready
    const resvg = new Resvg(svg, {
      font: { loadSystemFonts: false, fontBuffers: this.fonts, defaultFontFamily: OG_FONT_FAMILY },
      fitTo: { mode: 'original' },
    })
    try {
      const image = resvg.render()
      try {
        return image.asPng()
      } finally {
        image.free()
      }
    } finally {
      resvg.free()
    }
  }
}
