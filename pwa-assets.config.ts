// PWA icons generated from public/favicon.svg by `npm run pwa:icons` (docs/PWA.md).
// The PNGs are written next to the source (public/) and committed; vite.config.ts lists them in the manifest.
import { defineConfig, type Preset } from '@vite-pwa/assets-generator/config'

/** The app's accent colour (index.html theme-color), behind the maskable and Apple icons. */
const ICON_BACKGROUND = '#0369a1'

const octetlabPreset: Preset = {
  // The rounded square of the favicon, edge to edge: install dialogs and launchers that do not mask.
  transparent: { sizes: [192, 512], padding: 0, favicons: [[48, 'favicon.ico']] },
  // Full-bleed accent background; padding keeps the glyph inside the 80 % safe zone of maskable icons.
  maskable: { sizes: [512], padding: 0.2, resizeOptions: { background: ICON_BACKGROUND } },
  // iOS rounds the corners itself and shows transparent pixels as black: fill them with the accent.
  apple: { sizes: [180], padding: 0.2, resizeOptions: { background: ICON_BACKGROUND } },
}

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: octetlabPreset,
  images: ['public/favicon.svg'],
})
