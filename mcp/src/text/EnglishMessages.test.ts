import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnglishMessages } from './EnglishMessages'

const messages = new EnglishMessages()

describe('EnglishMessages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders plain keys and interpolates values', () => {
    expect(messages.render({ key: 'engine:devicePoweredOff' })).toBe('The device is turned off. Turn it on before running commands.')
    expect(messages.render({ key: 'lab:share.tooLarge', params: { size: 40000, limit: 32000 } })).toContain('(40000 of at most 32000 characters)')
  })

  it('picks the English plural form from count', () => {
    expect(messages.text('workspace:properties.selected', { count: 1 })).toBe('1 item selected')
    expect(messages.text('workspace:properties.selected', { count: 3 })).toBe('3 items selected')
  })

  it('falls back to the key for unknown messages and logs it', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(messages.render({ key: 'engine:noSuchKey' })).toBe('engine:noSuchKey')
    expect(messages.text('nope:key')).toBeNull()
    expect(logged).toHaveBeenCalledOnce()
  })

  it('renders terminal lines: device text verbatim, app messages translated', () => {
    expect(messages.lines([{ kind: 'output', text: 'Reply from 10.0.0.1' }, { kind: 'error', message: { key: 'engine:devicePoweredOff' } }])).toEqual([
      'Reply from 10.0.0.1',
      'The device is turned off. Turn it on before running commands.',
    ])
  })
})
