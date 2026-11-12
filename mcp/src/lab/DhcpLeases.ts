// DHCP leases for end devices through the packet simulator: the same exchange as `ipconfig /renew`
// (SimTerminal injects the same `dhcpRenew` request), but for any end device (also cameras, phones,
// printers without a terminal) and for many devices on one simulator, one after the other in lab order.
// The engine applies the leases to its network (docs/SIMULATION.md §5.4); that network becomes the lab.
// Router interfaces with `ip address dhcp` are not DHCP clients in Octetlab's simulator.
import { StateInvariants, type Device, type LabDocument } from '../../../src/domain'
import { L3Interfaces } from '../../../src/net/L3Interfaces'
import type { DhcpAdapterFailure } from '../../../src/sim/contract'
import { createSimulation } from '../../../src/sim/createSimulation'

export interface LeaseOutcome {
  deviceId: string
  portId: string
  ok: boolean
  /** "192.168.1.10/255.255.255.0" when ok. */
  address?: string
  /** Why no lease, when not ok. */
  problem?: string
}

export interface LeaseRun {
  doc: LabDocument
  outcomes: LeaseOutcome[]
}

const PROBLEM: Readonly<Record<DhcpAdapterFailure, string>> = {
  requestTimedOut: 'no DHCP server answered (no server or route to it, server off, or its pool is full)',
  dhcpNak: 'the DHCP server refused the request (NAK)',
  cableDisconnected: 'the network card has no working cable or wireless link',
  portDisabled: 'the port is shut down',
  invalidConfig: 'the network card is not set to DHCP',
  powerOff: 'the device is off',
}

export class DhcpLeases {
  private readonly invariants = new StateInvariants()

  /** A powered end device with a network card in DHCP mode. */
  isClient(device: Device): boolean {
    return device.powered && device.host !== undefined && L3Interfaces.nics(device).some((nic) => nic.addressing === 'dhcp')
  }

  /** DHCP clients of the lab with a cabled (plugged-in) DHCP card that has no address, in lab order. */
  waiting(doc: LabDocument): string[] {
    const plugged = (deviceId: string, portId: string | undefined): boolean =>
      doc.state.links.some((link) => link.connected && [link.a, link.b].some((end) => end.deviceId === deviceId && end.portId === portId))
    return doc.state.devices
      .filter((device) => this.isClient(device) && L3Interfaces.nics(device).some((nic) => nic.addressing === 'dhcp' && nic.address === '' && plugged(device.id, nic.portId)))
      .map((device) => device.id)
  }

  /** Asks for leases for `deviceIds` (each a DHCP client) in order; failed exchanges are listed, not thrown. */
  obtain(doc: LabDocument, deviceIds: readonly string[]): LeaseRun {
    if (deviceIds.length === 0) return { doc, outcomes: [] }
    const engine = createSimulation(doc.state)
    const outcomes: LeaseOutcome[] = []
    let effects = 0
    for (const deviceId of deviceIds) {
      const requestId = engine.inject({ kind: 'dhcpRenew', deviceId })
      engine.runUntilDone(requestId)
      const result = engine.request(requestId)?.result
      if (result?.kind !== 'dhcp') {
        outcomes.push({ deviceId, portId: '', ok: false, problem: 'the DHCP exchange did not finish in the simulator' })
        continue
      }
      effects += result.effects.length
      for (const adapter of result.adapters) {
        if (!adapter.ok) outcomes.push({ deviceId, portId: adapter.portId, ok: false, problem: PROBLEM[adapter.reason] })
        else if (!('released' in adapter)) outcomes.push({ deviceId, portId: adapter.portId, ok: true, address: `${adapter.ip}/${adapter.mask}` })
      }
    }
    if (effects === 0) return { doc, outcomes }
    const next = engine.network()
    const violations = this.invariants.violations(next)
    if (violations.length > 0) {
      console.error('DhcpLeases: the simulator state after DHCP breaks lab invariants; not saved', violations)
      return { doc, outcomes: outcomes.map((outcome) => (outcome.ok ? { deviceId: outcome.deviceId, portId: outcome.portId, ok: false, problem: 'the lease could not be saved to the lab' } : outcome)) }
    }
    return { doc: { ...doc, state: next }, outcomes }
  }

  /** Leases for every DHCP client still without an address (after a change that may have enabled them). */
  settle(doc: LabDocument): LeaseRun {
    return this.obtain(doc, this.waiting(doc))
  }

  /** "pc1 eth0 → 192.168.1.10/255.255.255.0" / "cam1 eth0: no DHCP server answered …" */
  lines(outcomes: readonly LeaseOutcome[]): string[] {
    return outcomes.map((outcome) => `${outcome.deviceId} ${outcome.portId}${outcome.ok ? ` → ${outcome.address ?? ''}` : `: ${outcome.problem ?? 'no lease'}`}`)
  }

  /** "Got DHCP leases on 3 cards." / "Got DHCP leases on 2 of 3 cards." / "No DHCP lease (1 card asked)." / '' when nothing was asked. */
  summary(outcomes: readonly LeaseOutcome[]): string {
    const asked = outcomes.length
    if (asked === 0) return ''
    const ok = outcomes.filter((outcome) => outcome.ok).length
    if (ok === 0) return `No DHCP lease (${asked === 1 ? '1 card' : `${asked} cards`} asked).`
    if (ok === asked) return ok === 1 ? 'Got a DHCP lease.' : `Got DHCP leases on ${ok} cards.`
    return `Got DHCP leases on ${ok} of ${asked} cards.`
  }
}
