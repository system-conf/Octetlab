// Test-only: the VLAN lab of the engine tests as a lab document with a grid layout (share page tests).
import type { LabDocument } from '../../../domain'
import { vlanLab } from '../../../engine/testNetworks'
import { createLabFromState } from '../../../lab/createLab'

export function shareTestLab(title = 'Cafe VLANs'): LabDocument {
  const state = vlanLab()
  const devices = Object.fromEntries(state.devices.map((device, index) => [device.id, { x: (index % 4) * 200, y: Math.floor(index / 4) * 150 }]))
  return createLabFromState(state, { devices }, { title, now: new Date('2026-11-13T10:00:00.000Z') })
}
