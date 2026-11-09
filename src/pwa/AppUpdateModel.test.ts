import { describe, expect, it, vi } from 'vitest'
import { APPLY_TIMEOUT_MS, AppUpdateModel, type Scheduler } from './AppUpdateModel'

/** A scheduler whose timers run only when the test fires them. */
function manualScheduler() {
  const timers: { callback: () => void; delayMs: number; cancelled: boolean }[] = []
  const schedule: Scheduler = (callback, delayMs) => {
    const timer = { callback, delayMs, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  const fireAll = () => {
    for (const timer of timers) if (!timer.cancelled) timer.callback()
  }
  return { schedule, timers, fireAll }
}

function setup() {
  const reload = vi.fn()
  const scheduler = manualScheduler()
  const model = new AppUpdateModel({ reload, schedule: scheduler.schedule })
  const applyUpdate = vi.fn(() => Promise.resolve())
  model.connect(applyUpdate)
  return { model, reload, scheduler, applyUpdate }
}

describe('AppUpdateModel', () => {
  it('starts idle and shows the toast when a new version waits', () => {
    const { model } = setup()
    const listener = vi.fn()
    model.subscribe(listener)

    expect(model.getPhase()).toBe('idle')
    model.markUpdateReady()

    expect(model.getPhase()).toBe('ready')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('never reloads on its own: a waiting version only changes the phase', () => {
    const { model, reload, applyUpdate } = setup()

    model.markUpdateReady()

    expect(reload).not.toHaveBeenCalled()
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('Reload activates the waiting worker, then reloads when it takes control', async () => {
    const { model, reload, applyUpdate, scheduler } = setup()
    model.markUpdateReady()

    await model.applyNow()
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(model.getPhase()).toBe('applying')
    expect(scheduler.timers[0]?.delayMs).toBe(APPLY_TIMEOUT_MS)
    expect(reload).not.toHaveBeenCalled()

    model.handleControllerChange()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(scheduler.timers[0]?.cancelled).toBe(true)
  })

  it('does not reload a tab that did not ask: another tab activated the version', () => {
    const { model, reload } = setup()

    model.handleControllerChange()

    expect(reload).not.toHaveBeenCalled()
    expect(model.getPhase()).toBe('ready')
  })

  it('after another tab activated the version, Reload in this tab reloads directly', async () => {
    const { model, reload, applyUpdate } = setup()
    model.markUpdateReady()
    model.handleControllerChange()

    await model.applyNow()

    expect(applyUpdate).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('dismiss hides the toast without reloading; a later update shows it again', () => {
    const { model, reload } = setup()
    model.markUpdateReady()

    model.dismiss()
    expect(model.getPhase()).toBe('idle')
    expect(reload).not.toHaveBeenCalled()

    model.markUpdateReady()
    expect(model.getPhase()).toBe('ready')
  })

  it('reports a failure when the new version does not take over in time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { model, reload, scheduler } = setup()
    model.markUpdateReady()
    await model.applyNow()

    scheduler.fireAll()

    expect(model.getPhase()).toBe('failed')
    expect(reload).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reports a failure (and logs it) when activating the worker throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const reload = vi.fn()
    const scheduler = manualScheduler()
    const model = new AppUpdateModel({ reload, schedule: scheduler.schedule })
    model.connect(() => Promise.reject(new Error('no waiting worker')))
    model.markUpdateReady()

    await model.applyNow()

    expect(model.getPhase()).toBe('failed')
    expect(logged).toHaveBeenCalled()
    expect(scheduler.timers[0]?.cancelled).toBe(true)
    // A late takeover after the failure is not this tab's request any more: no surprise reload.
    model.handleControllerChange()
    expect(reload).not.toHaveBeenCalled()
    logged.mockRestore()
    warn.mockRestore()
  })

  it('ignores a second Reload and a dismiss while applying', async () => {
    const { model, applyUpdate } = setup()
    model.markUpdateReady()
    await model.applyNow()

    await model.applyNow()
    model.dismiss()
    model.markUpdateReady()

    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(model.getPhase()).toBe('applying')
  })

  it('stops notifying after unsubscribe', () => {
    const { model } = setup()
    const listener = vi.fn()
    const unsubscribe = model.subscribe(listener)

    unsubscribe()
    model.markUpdateReady()

    expect(listener).not.toHaveBeenCalled()
  })
})
