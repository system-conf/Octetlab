/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Installable, offline-capable app (docs/PWA.md). The service worker precaches the whole build;
// a new version waits until the user chooses to reload (src/pwa/AppUpdateModel.ts).
const pwa = VitePWA({
  registerType: 'prompt',
  // src/pwa/ServiceWorkerRegistrar.ts registers through `virtual:pwa-register`; nothing is injected.
  injectRegister: false,
  // The icons are already in workbox.globPatterns; listing them twice would duplicate precache entries.
  includeManifestIcons: false,
  manifest: {
    id: '/',
    name: 'Octetlab',
    short_name: 'Octetlab',
    description:
      'A free, open-source network lab in your browser. Build and cable networks, configure them from a GUI or an IOS-style CLI, watch every packet in simulation mode, and learn with sample labs, troubleshooting exercises and design tasks.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#0369a1',
    // --color-page (light) in src/index.css: the splash screen matches the first paint.
    background_color: '#f8fafc',
    lang: 'en',
    dir: 'ltr',
    categories: ['education'],
    // Generated from public/favicon.svg by `npm run pwa:icons` (pwa-assets.config.ts).
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Everything the build emits: index.html, every JS chunk (lazy screens, the simulation worker,
    // lazy locale chunks), CSS and the icons. The manifest is added by the plugin.
    globPatterns: ['**/*.{html,js,css,svg,png,ico}'],
    // The Open Graph share image is for link previews only, not for the app.
    globIgnores: ['ogImage.png'],
    // App routes (/lab, /samples/…, /exercises/…, /design/…, /preferences) are client-side:
    // offline navigations get the precached index.html. `#lab=…` share links never reach the server.
    navigateFallback: 'index.html',
    // Old precached chunks stay until the new worker activates (after the user reloads).
    cleanupOutdatedCaches: true,
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), pwa],
  test: {
    environment: 'node',
    // mcp/: the MCP server Worker (docs/MCP_SERVER.md); its tests run here, its code is bundled by wrangler.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'mcp/**/*.test.ts'],
    passWithNoTests: true,
  },
})
