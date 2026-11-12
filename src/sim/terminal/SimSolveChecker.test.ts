import { describe, expect, it } from 'vitest'
import type { SolveCondition } from '../../domain'
import { networkEngine, solveChecker } from '../../engine'
import { editHost } from '../../engine/testLabs'
import { editNic, officeLab, vlanLab, wanDown } from '../../engine/testNetworks'
import { createSimulation } from '../createSimulation'
import { goldenExercises } from './goldenLabs'
import { SimAppLinks, SimSolveChecker } from './index'

const OFFICE_CONDITIONS: SolveCondition[] = [
  { type: 'internet', fromDeviceId: 'pc1' },
  { type: 'resolves', fromDeviceId: 'pc1', name: 'google.com' },
  { type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' },
  { type: 'appLinksOk', deviceId: 'pc1' },
]

describe('SimSolveChecker (rule engine SolveChecker = oracle)', () => {
  it.each(goldenExercises.map((exercise) => [exercise.id, exercise] as const))('agrees on exercise %s, at the start and fixed', (_id, exercise) => {
    const atStart = new SimSolveChecker().check(exercise.initial, exercise.solvedWhen)
    expect(atStart).toEqual(solveChecker.check(exercise.initial, exercise.solvedWhen))
    expect(atStart.some((result) => !result.ok)).toBe(true)
    const fixed = SimSolveChecker.check(exercise.fixed, exercise.solvedWhen)
    expect(fixed).toEqual(solveChecker.check(exercise.fixed, exercise.solvedWhen))
    expect(fixed.every((result) => result.ok)).toBe(true)
  })

  it('agrees on every condition type, working and broken', () => {
    const broken = editNic(editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.254'] }), 'printer', { address: '192.168.1.153' })
    for (const state of [officeLab(), broken, wanDown(officeLab()), editNic(officeLab(), 'printer', { address: '' })]) {
      expect(SimSolveChecker.check(state, OFFICE_CONDITIONS)).toEqual(solveChecker.check(state, OFFICE_CONDITIONS))
    }
  })

  it("'unreachable' is the opposite of 'reachable' and never holds for a target without an address", () => {
    const blocked: SolveCondition[] = [{ type: 'unreachable', fromDeviceId: 'pc1', toDeviceId: 'printer' }]
    expect(SimSolveChecker.check(officeLab(), blocked)[0]?.ok).toBe(false)
    // A printer in another subnet without routing is a stand-in for "blocked" until ACLs exist.
    expect(SimSolveChecker.check(editNic(officeLab(), 'printer', { address: '10.9.9.9' }), blocked)[0]?.ok).toBe(true)
    expect(SimSolveChecker.check(editNic(officeLab(), 'printer', { address: '' }), blocked)[0]?.ok).toBe(false)
    expect(solveChecker.check(officeLab(), blocked)).toEqual(SimSolveChecker.check(officeLab(), blocked))
  })

  it('checks app links like the engine: reachable and the right kind of device', () => {
    for (const [state, deviceId] of [[officeLab(), 'pc1'], [vlanLab(), 'kasa']] as const) {
      const engine = createSimulation(state)
      expect(SimAppLinks.status(engine, deviceId)).toEqual(networkEngine.appLinkStatus(state, deviceId))
    }
  })
})
