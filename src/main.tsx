import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IllustratedIconDefs } from './catalog'
import { initI18n } from './i18n'
import { PreferencesProvider } from './preferences'

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
