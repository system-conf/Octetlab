import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IllustratedIconDefs } from './catalog'
import { initI18n } from './i18n'
import { PreferencesProvider } from './preferences'
import { StaleChunkRecovery } from './routing/StaleChunkRecovery'
import AppUpdateToast from './features/app/AppUpdateToast'
import { AppUpdateModel } from './pwa/AppUpdateModel'
import { ServiceWorkerRegistrar } from './pwa/ServiceWorkerRegistrar'

// A tab opened before a deploy may ask for chunks that no longer exist: reload once to get the new build.
// Storage is read lazily: even touching window.sessionStorage can throw when site data is blocked.
const recoveryStorage = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
}
new StaleChunkRecovery(recoveryStorage, () => window.location.reload()).listen(window)

// Offline support and the "new version available" toast (docs/PWA.md).
const appUpdate = new AppUpdateModel({ reload: () => window.location.reload() })
new ServiceWorkerRegistrar(appUpdate).register()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element #root not found in index.html')
}
const root = createRoot(rootElement)

function renderApp(): void {
  root.render(
    <StrictMode>
      <PreferencesProvider>
        <IllustratedIconDefs />
        <App />
        <AppUpdateToast model={appUpdate} />
      </PreferencesProvider>
    </StrictMode>,
  )
}

// Render only after the detected language is loaded: no flash of raw keys. If init fails the app
// still renders (i18next falls back to the bundled en resources or shows keys).
initI18n().then(renderApp, (error: unknown) => {
  console.error('i18n initialization failed', error)
  renderApp()
})
