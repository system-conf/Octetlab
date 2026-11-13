// What the firewall lesson texts promise, on the simulator (the sample's steps are manual: StepChecker's
// rule engine knows no firewall, docs/SIMULATION.md §10.3.8).
import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { editDevice } from '../../scenarios/security/securityFixes'
import { nameif, noNameif } from '../../scenarios/security/firewallSetup'
import { removeOpenBinding } from '../../scenarios/security/firewallFixes'
import { createSimulation, SimProbes } from '../../sim'
import { FIREWALL_PUBLISHED_ADDRESS, FIREWALL_WEB_ADDRESS, HOME_ADDRESS, securityFirewallOffice } from './firewallSamples'

const PC1 = '192.168.1.10'

function pings(state: NetworkState, from: string, ...targets: string[]): boolean[] {
  const engine = createSimulation(state)
  return targets.map((target) => SimProbes.reach(engine, from, target).result.ok)
}

const lab = () => securityFirewallOffice.lab().state

describe('securityFirewallOffice', () => {
  it('insideOut: PC1 reaches the DMZ server and, through PAT, the home laptop', () => {
    expect(pings(lab(), 'pc1', FIREWALL_WEB_ADDRESS, HOME_ADDRESS)).toEqual([true, true])
  })

  it('dmzCannotStart: WEB1 (dmz 50) cannot start a connection to PC1 (inside 100)', () => {
    expect(pings(lab(), 'web1', PC1)).toEqual([false])
  })

  it('publishedSite: HOME1 reaches the site at its public address (static NAT + OUTSIDE_IN on the real address)', () => {
    expect(pings(lab(), 'home1', FIREWALL_PUBLISHED_ADDRESS)).toEqual([true])
  })

  it('break it, unbindException: without the access-group the site is closed again', () => {
    const state = removeOpenBinding(lab(), 'fw1')
    expect(pings(state, 'home1', FIREWALL_PUBLISHED_ADDRESS)).toEqual([false])
  })

  it('break it, noNameifDmz: an interface without nameif carries nothing, WEB1 is cut off', () => {
    const state = editDevice(lab(), 'fw1', noNameif('Gi0/2'))
    expect(pings(state, 'pc1', FIREWALL_WEB_ADDRESS)).toEqual([false])
    expect(pings(state, 'pc1', HOME_ADDRESS)).toEqual([true])
  })

  it('break it, dmzLevel100: inside and dmz at the same level block each other', () => {
    const state = editDevice(lab(), 'fw1', nameif('Gi0/2', 'dmz', 100))
    expect(pings(state, 'pc1', FIREWALL_WEB_ADDRESS)).toEqual([false])
  })

  it('the lesson addresses are the lab addresses', () => {
    const web = lab().devices.find((device) => device.id === 'web1')
    const nic = web?.ports.find((port) => port.id === 'eth0')
    expect(nic?.role === 'host' ? nic.l3.ipv4.address : undefined).toBe(FIREWALL_WEB_ADDRESS)
  })
})
