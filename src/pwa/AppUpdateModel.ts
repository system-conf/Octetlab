// State of the "new version available" toast (docs/PWA.md). The service worker installs a new
// version in the background and leaves it waiting; the page never reloads on its own. The user
// reloads from the toast (or dismisses it and gets the new version the next time Octetlab opens).

/**
 * - `idle`: nothing to show.
 * - `ready`: a new version is installed and waits; the toast offers a reload.
 * - `applying`: the user chose to reload; waiting for the new version to take over.
 * - `failed`: the new version did not take over in time; the toast says how to get it.
 */
export type AppUpdatePhase = 'idle' | 'ready' | 'applying' | 'failed'

/** Activates the waiting service worker (skipWaiting). */
export type ApplyUpdate = () => Promise<void>

/** Starts a timer and returns its cancel function. */
export type Scheduler = (callback: () => void, delayMs: number) => () => void

interface AppUpdateModelOptions {
  reload: () => void
  schedule?: Scheduler
}

/** How long the waiting version gets to take over after "Reload" before the toast reports a failure. */
export const APPLY_TIMEOUT_MS = 10_000

const browserScheduler: Scheduler = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

export class AppUpdateModel {
  private phase: AppUpdatePhase = 'idle'
  private applyUpdate: ApplyUpdate | null = null
  /** This tab asked for the update: the reload after the takeover is expected. */
  private requestedHere = false
  /** Another tab already activated the new version: a plain reload loads it. */
  private activeElsewhere = false
  private cancelTimeout: (() => void) | null = null
  private readonly listeners = new Set<() => void>()
  private readonly reload: () => void
  private readonly schedule: Scheduler

  constructor(options: AppUpdateModelOptions) {
    this.reload = options.reload
    this.schedule = options.schedule ?? browserScheduler
  }

  /** Connects the service worker's skipWaiting call (set once registration is set up). */
  connect(applyUpdate: ApplyUpdate): void {
    this.applyUpdate = applyUpdate
  }

  /** A new version is installed and waiting. */
  markUpdateReady(): void {
    if (this.phase === 'applying') return
    this.setPhase('ready')
  }

  /**
   * The new version took control of this tab. The reload is expected when this tab asked for
   * it; otherwise another tab activated it, and this tab only offers the reload (a lab being
   * edited here is never reloaded under the user).
   */
  handleControllerChange(): void {
    if (this.requestedHere) {
      this.finishApplying()
      this.reload()
      return
    }
    this.activeElsewhere = true
    this.markUpdateReady()
  }

  /** "Reload" in the toast. */
  async applyNow(): Promise<void> {
    if (this.phase === 'applying') return
    this.requestedHere = true
    if (this.activeElsewhere || this.applyUpdate === null) {
      // The new version already controls this tab (or there is no worker to switch): just reload.
      this.reload()
      return
    }
    this.setPhase('applying')
    this.cancelTimeout = this.schedule(() => this.failApplying(), APPLY_TIMEOUT_MS)
    try {
      await this.applyUpdate()
    } catch (error: unknown) {
      console.error('Activating the new version failed.', error)
      this.failApplying()
    }
  }

  /** Hides the toast; the waiting version is used the next time Octetlab opens. */
  dismiss(): void {
    if (this.phase === 'applying') return
    this.setPhase('idle')
  }

  getPhase(): AppUpdatePhase {
    return this.phase
  }

  /** useSyncExternalStore subscription. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private failApplying(): void {
    if (this.phase !== 'applying') return
    this.finishApplying()
    this.requestedHere = false
    console.warn('The new version did not take over in time; it is used after all Octetlab tabs are closed.')
    this.setPhase('failed')
  }

  private finishApplying(): void {
    this.cancelTimeout?.()
    this.cancelTimeout = null
  }

  private setPhase(phase: AppUpdatePhase): void {
    if (this.phase === phase) return
    this.phase = phase
    for (const listener of this.listeners) listener()
  }
}
