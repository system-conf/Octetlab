// Renders the link-preview image (Open Graph / X card) from its SVG source into public/, which Vite
// copies to the site root. Usage: npm run og:image
// sharp (librsvg inside) draws the text with the fonts installed on this machine; check the result.
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const SOURCE = new URL('../docs/images/ogImage.svg', import.meta.url)
const TARGET = new URL('../public/ogImage.png', import.meta.url)
const WIDTH = 1200
const HEIGHT = 630
const MAX_BYTES = 300 * 1024

const path = (url) => decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1')

mkdirSync(new URL('.', TARGET), { recursive: true })
const info = await sharp(path(SOURCE), { density: 72 })
  .resize(WIDTH, HEIGHT)
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(path(TARGET))

if (info.width !== WIDTH || info.height !== HEIGHT) {
  throw new Error(`ogImage.png is ${info.width}×${info.height}, expected ${WIDTH}×${HEIGHT}.`)
}
if (info.size > MAX_BYTES) {
  throw new Error(`ogImage.png is ${Math.round(info.size / 1024)} KB; link previews want it under ${MAX_BYTES / 1024} KB.`)
}
console.log(`Wrote public/ogImage.png (${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB).`)
