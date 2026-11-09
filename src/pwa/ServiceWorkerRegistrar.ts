// Registers the service worker built by vite-plugin-pwa (docs/PWA.md) and feeds its update events
// to AppUpdateModel. In `vite dev` the virtual module is a no-op (devOptions stay disabled).
import { registerSW } from 'virtual:pwa-register'
import type { AppUpdateModel } from './AppUpdateModel'

/** A tab left open for days still learns about new deploys (browsers check on navigations only). */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export class ServiceWorkerRegistrar {
  private readonly model: AppUpdateModel

  constructor(model: AppUpdateModel) {
    this.model = model
  }

  register(): void {
    const activateWaitingWorker = registerSW({
      onNeedRefresh: () => this.model.markUpdateReady(),
      // The new worker took control: AppUpdateModel decides whether this tab reloads now.
      onNeedReload: () => this.model.handleControllerChange(),
      onOfflineReady: () => console.info('Octetlab is ready to work offline.'),
      onRegisteredSW: (_url, registration) => this.checkPeriodically(registration),
      onRegisterError: (error: unknown) =>
        console.error('Service worker registration failed; Octetlab works, but not offline.', error),
    })
    this.model.connect(() => activateWaitingWorker())
  }

  private checkPeriodically(registration: ServiceWorkerRegistration | undefined): void {
    if (registration === undefined) return
    setInterval(() => {
      if (registration.installing !== null || !navigator.onLine) return
      registration.update().catch((error: unknown) => {
        console.warn('Checking for a new Octetlab version failed; trying again later.', error)
      })
    }, UPDATE_CHECK_INTERVAL_MS)
  }
}
