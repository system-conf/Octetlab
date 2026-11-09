import { describe, expect, it, vi } from 'vitest'
import { StaleChunkRecovery } from './StaleChunkRecovery'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

function event() {
  return { preventDefault: vi.fn() }
}

describe('StaleChunkRecovery', () => {
  it('reloads once and suppresses the error on the first failure', () => {
    const reload = vi.fn()
    const recovery = new StaleChunkRecovery(memoryStorage(), reload, () => 1_000_000)
    const failed = event()

    expect(recovery.handle(failed)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(failed.preventDefault).toHaveBeenCalled()
  })

  it('does not reload again within the guard window, so a missing chunk cannot loop', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = memoryStorage()
    const reload = vi.fn()
    let now = 1_000_000
    const recovery = new StaleChunkRecovery(storage, reload, () => now)

    recovery.handle(event())
    now += 3_000
    const second = event()

    expect(recovery.handle(second)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.preventDefault).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reloads again after the guard window (a later deploy)', () => {
    const reload = vi.fn()
    let now = 1_000_000
    const recovery = new StaleChunkRecovery(memoryStorage(), reload, () => now)

    recovery.handle(event())
    now += 60_000

    expect(recovery.handle(event())).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('leaves the error visible when sessionStorage throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    }
    const reload = vi.fn()
    const failed = event()

    expect(new StaleChunkRecovery(broken, reload).handle(failed)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(failed.preventDefault).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('listens for vite:preloadError on the target', () => {
    const target = new EventTarget()
    const reload = vi.fn()
    const stop = new StaleChunkRecovery(memoryStorage(), reload, () => 1_000_000).listen(
      target as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
    )

    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    stop()
    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
