import { describe, expect, it } from 'vitest'
import { CableRules } from './CableRules'
import type { CableRequest, Link } from './LinkTypes'
import type { NetworkState } from './NetworkState'
import { cableLab, updatePort, withLinks } from './testDevices'

const rules = new CableRules()
const lab = cableLab()

function request(cableRequest: CableRequest, state: NetworkState = lab) {
  return rules.check(state, cableRequest)
}

function end(deviceId: string, portId: string) {
  return { deviceId, portId }
}

function noMdix(state: NetworkState, deviceId: string, portId: string): NetworkState {
  return updatePort(state, deviceId, portId, (port) => ({ ...port, autoMdix: false }))
}

const pcToSwitch: Link = { id: 'pcLink', a: end('pc', 'eth0'), b: end('sw', 'Fa0/1'), connected: true, cable: 'copperStraight' }

describe('CableRules.check — copper and auto-MDIX', () => {
  it('accepts straight-through and crossover between a PC and a switch (auto-MDIX on by default)', () => {
    expect(request({ a: end('pc', 'eth0'), b: end('sw', 'Fa0/1'), cable: 'copperStraight' })).toEqual({ ok: true })
    expect(request({ a: end('pc', 'eth0'), b: end('sw', 'Fa0/1'), cable: 'copperCross' })).toEqual({ ok: true })
    expect(request({ a: end('sw', 'Fa0/1'), b: end('sw2', 'Fa0/1'), cable: 'copperStraight' })).toEqual({ ok: true })
  })

  it('needs the textbook cable when auto-MDIX is off on both ends', () => {
    const pcAndSwitch = noMdix(noMdix(lab, 'pc', 'eth0'), 'sw', 'Fa0/1')
    expect(request({ a: end('pc', 'eth0'), b: end('sw', 'Fa0/1'), cable: 'copperStraight' }, pcAndSwitch)).toEqual({ ok: true })
    expect(request({ a: end('pc', 'eth0'), b: end('sw', 'Fa0/1'), cable: 'copperCross' }, pcAndSwitch)).toEqual({
      ok: false,
      reason: 'straightThroughRequired',
    })

    const twoSwitches = noMdix(noMdix(lab, 'sw', 'Fa0/1'), 'sw2', 'Fa0/1')
    expect(request({ a: end('sw', 'Fa0/1'), b: end('sw2', 'Fa0/1'), cable: 'copperStraight' }, twoSwitches)).toEqual({
      ok: false,
      reason: 'crossoverRequired',
    })
    expect(request({ a: end('sw', 'Fa0/1'), b: end('sw2', 'Fa0/1'), cable: 'copperCross' }, twoSwitches)).toEqual({ ok: true })
  })

  it('accepts any copper cable when one end still has auto-MDIX', () => {
    const oneEnd = noMdix(lab, 'sw', 'Fa0/1')
    expect(request({ a: end('sw', 'Fa0/1'), b: end('sw2', 'Fa0/1'), cable: 'copperStraight' }, oneEnd)).toEqual({ ok: true })
  })

  it('needs a straight-through cable between a router and an access point with auto-MDIX off', () => {
    const state = noMdix(noMdix(lab, 'router', 'Gi0/0'), 'ap', 'Gi0')
    expect(request({ a: end('router', 'Gi0/0'), b: end('ap', 'Gi0'), cable: 'copperStraight' }, state)).toEqual({ ok: true })
    expect(request({ a: end('router', 'Gi0/0'), b: end('ap', 'Gi0'), cable: 'copperCross' }, state)).toEqual({
      ok: false,
      reason: 'straightThroughRequired',
    })
  })

  it('uses an explicit pinout over the derived one', () => {
    const state = noMdix(noMdix(updatePort(lab, 'pc', 'eth0', (port) => ({ ...port, pinout: 'mdix' })), 'pc', 'eth0'), 'sw', 'Fa0/1')
    expect(request({ a: end('pc', 'eth0'), b: end('sw', 'Fa0/1'), cable: 'copperStraight' }, state)).toEqual({
      ok: false,
      reason: 'crossoverRequired',
    })
  })
})

describe('CableRules.check — media', () => {
  it('joins fiber, serial and console ports with their own cables', () => {
    expect(request({ a: end('sw', 'Gi0/1'), b: end('sw2', 'Gi0/1'), cable: 'fiber' })).toEqual({ ok: true })
    expect(request({ a: end('router', 'Se0/0/0'), b: end('router2', 'Se0/0/0'), cable: 'serial', dceEnd: 'a' })).toEqual({ ok: true })
    expect(request({ a: end('router', 'Console'), b: end('pc', 'RS232'), cable: 'console' })).toEqual({ ok: true })
  })

  it('refuses a cable whose connector does not fit, naming the end', () => {
    expect(request({ a: end('sw', 'Gi0/1'), b: end('sw2', 'Fa0/1'), cable: 'fiber' })).toEqual({
      ok: false,
      reason: 'cableDoesNotFitPort',
      side: 'b',
    })
    expect(request({ a: end('router', 'Gi0/0'), b: end('router2', 'Se0/0/0'), cable: 'serial', dceEnd: 'b' })).toEqual({
      ok: false,
      reason: 'cableDoesNotFitPort',
      side: 'a',
    })
    expect(request({ a: end('cloud', 'coax0'), b: end('pc', 'eth0'), cable: 'coaxial' })).toEqual({
      ok: false,
      reason: 'cableDoesNotFitPort',
      side: 'b',
    })
  })

  it('needs a terminal on one end of a console cable', () => {
    expect(request({ a: end('router', 'Console'), b: end('sw', 'Console'), cable: 'console' })).toEqual({
      ok: false,
      reason: 'consoleNeedsTerminal',
    })
  })
})

describe('CableRules.check — wireless', () => {
  it('associates a client NIC with a radio on a named SSID', () => {
    expect(request({ a: end('laptop', 'wlan0'), b: end('ap', 'Radio0'), cable: 'wireless', ssid: 'Office' })).toEqual({ ok: true })
  })

  it('accepts an SSID the AP does not offer (a misconfigured client is valid lab data)', () => {
    expect(request({ a: end('laptop', 'wlan0'), b: end('ap', 'Radio0'), cable: 'wireless', ssid: 'Guest' })).toEqual({ ok: true })
  })

  it('refuses an empty SSID and wrong ends', () => {
    expect(request({ a: end('laptop', 'wlan0'), b: end('ap', 'Radio0'), cable: 'wireless', ssid: ' ' })).toEqual({
      ok: false,
      reason: 'ssidRequired',
    })
    expect(request({ a: end('pc', 'eth0'), b: end('ap', 'Radio0'), cable: 'wireless', ssid: 'Office' })).toEqual({
      ok: false,
      reason: 'wirelessNeedsClientAndRadio',
    })
    expect(request({ a: end('laptop', 'wlan0'), b: end('pc', 'wlan0'), cable: 'wireless', ssid: 'Office' })).toEqual({
      ok: false,
      reason: 'wirelessNeedsClientAndRadio',
    })
  })

  it('lets many clients share one radio, but a client NIC joins only once', () => {
    const laptopJoined = withLinks(lab, [
      { id: 'laptopAir', a: end('laptop', 'wlan0'), b: end('ap', 'Radio0'), connected: true, cable: 'wireless', ssid: 'Office' },
    ])
    expect(request({ a: end('pc', 'wlan0'), b: end('ap', 'Radio0'), cable: 'wireless', ssid: 'Office' }, laptopJoined)).toEqual({
      ok: true,
    })
    expect(request({ a: end('ap', 'Radio0'), b: end('laptop', 'wlan0'), cable: 'wireless', ssid: 'Office' }, laptopJoined)).toEqual({
      ok: false,
      reason: 'portInUse',
      side: 'b',
    })
  })
})

describe('CableRules.check — ends', () => {
  it('refuses unknown devices and ports, naming the end', () => {
    expect(request({ a: end('nobody', 'eth0'), b: end('sw', 'Fa0/1'), cable: 'copperStraight' })).toEqual({
      ok: false,
      reason: 'unknownDevice',
      side: 'a',
    })
    expect(request({ a: end('pc', 'eth0'), b: end('sw', 'Fa0/9'), cable: 'copperStraight' })).toEqual({
      ok: false,
      reason: 'unknownPort',
      side: 'b',
    })
  })

  it('refuses a cable between two ports of one device', () => {
    expect(request({ a: end('sw', 'Fa0/1'), b: end('sw', 'Fa0/2'), cable: 'copperCross' })).toEqual({ ok: false, reason: 'sameDevice' })
  })

  it('refuses a port that already holds a link, even an unplugged one', () => {
    const state = withLinks(lab, [{ ...pcToSwitch, connected: false }])
    expect(request({ a: end('sw2', 'Fa0/1'), b: end('sw', 'Fa0/1'), cable: 'copperCross' }, state)).toEqual({
      ok: false,
      reason: 'portInUse',
      side: 'b',
    })
  })

  it('validates an existing link without counting its own ports as used', () => {
    const state = withLinks(lab, [pcToSwitch])
    expect(rules.validateLink(state, pcToSwitch)).toEqual({ ok: true })
  })
})

describe('CableRules.checkEnd', () => {
  const state = withLinks(lab, [pcToSwitch])

  it('reports whether one port can take a cable now', () => {
    expect(rules.checkEnd(state, end('sw', 'Fa0/2'), 'copperStraight')).toEqual({ ok: true })
    expect(rules.checkEnd(state, end('sw', 'Fa0/1'), 'copperStraight')).toEqual({ ok: false, reason: 'portInUse' })
    expect(rules.checkEnd(state, end('sw', 'Fa0/1'), 'copperStraight', 'pcLink')).toEqual({ ok: true })
    expect(rules.checkEnd(state, end('sw', 'Fa0/2'), 'fiber')).toEqual({ ok: false, reason: 'cableDoesNotFitPort' })
    expect(rules.checkEnd(state, end('ap', 'Gi0'), 'wireless')).toEqual({ ok: false, reason: 'cableDoesNotFitPort' })
    expect(rules.checkEnd(state, end('ap', 'Radio0'), 'wireless')).toEqual({ ok: true })
    expect(rules.checkEnd(state, end('pc', 'eth9'), 'copperStraight')).toEqual({ ok: false, reason: 'unknownPort' })
  })
})

describe('CableRules.autoCable', () => {
  it('picks straight-through between MDI and MDI-X and crossover between equal pinouts', () => {
    expect(rules.autoCable(lab, end('pc', 'eth0'), end('sw', 'Fa0/1'))).toBe('copperStraight')
    expect(rules.autoCable(lab, end('router', 'Gi0/0'), end('sw', 'Fa0/1'))).toBe('copperStraight')
    expect(rules.autoCable(lab, end('sw', 'Fa0/1'), end('sw2', 'Fa0/1'))).toBe('copperCross')
    expect(rules.autoCable(lab, end('router', 'Gi0/0'), end('pc', 'eth0'))).toBe('copperCross')
  })

  it('cables an access point straight-through, to a router as well as to a switch', () => {
    expect(rules.autoCable(lab, end('router', 'Gi0/0'), end('ap', 'Gi0'))).toBe('copperStraight')
    expect(rules.autoCable(lab, end('ap', 'Gi0'), end('router', 'Gi0/0'))).toBe('copperStraight')
    expect(rules.autoCable(lab, end('ap', 'Gi0'), end('sw', 'Fa0/1'))).toBe('copperStraight')
  })

  it('keeps the access point port MDI (it is not an MDI-X kind)', () => {
    const ap = lab.devices.find((device) => device.id === 'ap')
    const port = ap?.ports.find((candidate) => candidate.id === 'Gi0')
    if (!ap || !port) throw new Error('cableLab has no ap/Gi0')
    expect(rules.pinoutOf(ap, port)).toBe('mdi')
  })

  it('picks the cable of the shared medium', () => {
    expect(rules.autoCable(lab, end('sw', 'Gi0/1'), end('sw2', 'Gi0/1'))).toBe('fiber')
    expect(rules.autoCable(lab, end('router', 'Se0/0/0'), end('router2', 'Se0/0/0'))).toBe('serial')
    expect(rules.autoCable(lab, end('pc', 'RS232'), end('router', 'Console'))).toBe('console')
    expect(rules.autoCable(lab, end('laptop', 'wlan0'), end('ap', 'Radio0'))).toBe('wireless')
  })

  it('returns null when no cable joins the ports', () => {
    expect(rules.autoCable(lab, end('pc', 'eth0'), end('sw', 'Gi0/1'))).toBeNull()
    expect(rules.autoCable(lab, end('laptop', 'wlan0'), end('pc', 'wlan0'))).toBeNull()
    expect(rules.autoCable(lab, end('sw', 'Fa0/1'), end('sw', 'Fa0/2'))).toBeNull()
    expect(rules.autoCable(lab, end('pc', 'eth0'), end('nobody', 'eth0'))).toBeNull()
  })
})

describe('CableRules.mediumOf', () => {
  it('maps every cable to the medium of its connectors', () => {
    expect(CableRules.mediumOf('copperCross')).toBe('copper')
    expect(CableRules.mediumOf('wireless')).toBe('wireless')
    expect(CableRules.mediumOf('coaxial')).toBe('coaxial')
  })
})
