# Installable, offline app (PWA)

Octetlab can be installed ("Install app" in Chrome/Edge, "Add to Home Screen" on iOS/Android) and
opens with no network after the first visit. Labs, progress and preferences are already stored in the
browser (IndexedDB / localStorage); the service worker adds the app itself.

## Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| `vite-plugin-pwa` 2.0 (Workbox 7.4, `generateSW`) | `vite.config.ts` | Writes `dist/manifest.webmanifest`, `dist/sw.js` and adds `<link rel="manifest">` to `index.html` at build time. |
| Icon source | `public/favicon.svg` | The favicon (formerly an inline data URI in `index.html`). |
| Generated icons | `public/pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico` | Committed output of `npm run pwa:icons`. |
| Icon config | `pwa-assets.config.ts` | `@vite-pwa/assets-generator` preset (sizes, padding, background). |
| Registration | `src/pwa/ServiceWorkerRegistrar.ts` | Registers `sw.js` through `virtual:pwa-register`; checks for a new version every hour. |
| Update state | `src/pwa/AppUpdateModel.ts` (+ test) | idle → ready → applying (→ failed); decides when a tab may reload. |
| Toast | `src/features/app/AppUpdateToast.tsx`, `useAppUpdatePhase.ts` | "New version available — Reload" / "Yeni sürüm hazır — Yenile" (`common:appUpdate.*`). |

## What is cached

The precache holds the whole build: `index.html`, every JS chunk (including the lazily loaded
screens, the simulation web worker and the lazy locale chunks), the CSS, the icons and the manifest
(`workbox.globPatterns`). `ogImage.png` is left out (link previews only). At the time of writing:
60 entries, about 2.0 MiB uncompressed. The largest file (~420 KB) is far below Workbox's
`maximumFileSizeToCacheInBytes` default of 2 MiB, so the default is kept; the build fails if a file
ever grows past it (plugin behaviour since 0.20.2), and then the limit or the chunking must change.

Navigations to app routes (`/lab`, `/samples/…`, `/exercises/…`, `/design/…`, `/preferences`) get the
precached `index.html` (`navigateFallback`), so they open offline. Share links (`/#lab=…`) work
too: the fragment never reaches the server or the service worker.

## Update flow

`registerType: 'prompt'` (not `autoUpdate`): `autoUpdate` activates a new version at once and
reloads every open tab, which could reload the page while someone is cabling a lab. With `prompt`:

1. A deploy changes `sw.js`. The browser finds it on the next navigation or the hourly check and
   installs the new version in the background. It **waits**; the open tab keeps running the old
   version, whose chunks stay in the precache.
2. The toast appears (non-blocking, `role="status"` in a polite live region, no focus change).
3. **Reload** activates the waiting version (`SKIP_WAITING`); when it takes control the tab reloads.
   **Dismiss** hides the toast; the new version is used once every Octetlab tab has been closed.
4. If another tab activated the new version, this tab is **not** reloaded; it shows the toast and
   Reload then just reloads.
5. If the new version has not taken over 10 s after Reload, the toast says to close all tabs.

`src/routing/StaleChunkRecovery.ts` (reload once on `vite:preloadError`) stays as the fallback for
tabs without a service worker (first visit, blocked or unsupported) and for a tab whose old chunks
were removed because the new version was activated from another tab.

In `vite dev` nothing is registered (`devOptions` is off; `virtual:pwa-register` is a no-op).
Vitest never imports the registrar. Playwright runs against `vite preview`, so the worker registers
there as in production.

## Cloudflare

Workers static assets send `Cache-Control: public, max-age=0, must-revalidate` for every file
(checked in `miniflare`'s asset worker), so browsers always revalidate `sw.js` and
`manifest.webmanifest`; wrangler serves `.webmanifest` as `application/manifest+json`. No `_headers`
file is needed.

## Regenerating the icons

Edit `public/favicon.svg`, then:

```sh
npm run pwa:icons
```

This rewrites the PNGs and `favicon.ico` in `public/` (it needs `sharp`, which ships prebuilt
binaries as an optional dependency; no install script is required). Commit the results.

## Testing offline

1. `npm run build`, then `npx vite preview --port 5310 --strictPort`.
2. Open `http://localhost:5310/`, wait a moment (the console logs "Octetlab is ready to work
   offline."), reload once so the page is controlled by the worker.
3. DevTools → Application: the manifest, the service worker (activated) and the
   `workbox-precache-v2-…` cache (one entry per precached file).
4. Stop the preview server (or tick "Offline" in DevTools → Network) and open `/lab`, `/samples`,
   `/exercises`, `/design`, `/preferences`: each still renders.

To see the update toast locally: with the page open, rebuild after a code change (or change any byte
of `dist/sw.js`) and load the page again (address bar, not an in-app link: in-app navigations do not
check for updates); the toast appears, Reload switches to the new version.
