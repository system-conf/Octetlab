// The fonts of the Open Graph picture: Inter Bold and Medium (SIL Open Font License, see fonts/OFL.txt),
// cut down to Latin, Latin-1 and Latin Extended-A (Turkish included) to keep the Worker small.
// wrangler bundles `.ttf` files as ArrayBuffer data modules (mcp/wrangler.jsonc "rules").
import interBold from './fonts/InterBold.ttf'
import interMedium from './fonts/InterMedium.ttf'

export class OgFonts {
  static buffers(): Uint8Array[] {
    return [new Uint8Array(interBold), new Uint8Array(interMedium)]
  }
}
