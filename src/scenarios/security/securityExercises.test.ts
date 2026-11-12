// The pack 5.2 exercises on the simulator: valid labs, the broken start, the hint-3 fix (ACL / NAT packet
// policies) and the wrong fix the lesson warns about.
import { describe, expect, it } from 'vitest'
import { StateInvariants, type NetworkState, type SolveCondition } from '../../domain'
import { SimSolveChecker } from '../../sim'
import { CableRules } from '../../domain/CableRules'
import { securityExercises } from './index'
import { SECURITY_EXERCISE_INDEX } from './securityExerciseIndex'
import { blockGuests, blockGuestsEverywhere, overloadOffice } from './securityFixes'
import { cafeGuestWifi } from './cafeGuestWifi'
import { officeSharedIp } from './officeSharedIp'

function results(state: NetworkState, conditions: readonly SolveCondition[]): boolean[] {
  return SimSolveChecker.check(state, conditions).map((result) => result.ok)
}

describe('security exercises: data', () => {
  it('match the light index (ids, order, setting) and are valid labs', () => {
    expect(securityExercises.map(({ id, order, setting }) => ({ id, order, setting }))).toEqual(SECURITY_EXERCISE_INDEX)
    const rules = new CableRules()
    for (const exercise of securityExercises) {
      expect(new StateInvariants().violations(exercise.lab.state), exercise.id).toEqual([])
      for (const link of exercise.lab.state.links) expect(rules.validateLink(exercise.lab.state, link), `${exercise.id} ${link.id}`).toEqual({ ok: true })
      expect(Object.keys(exercise.lab.layout.devices).sort()).toEqual(exercise.lab.state.devices.map((device) => device.id).sort())
    }
  })

  it('leave only the router editable', () => {
    for (const exercise of securityExercises) {
      const locked = exercise.locks.flatMap((lock) => (lock.scope === 'device' ? [lock.deviceId] : []))
      expect(exercise.locks).toContainEqual({ scope: 'topology' })
      expect(exercise.lab.state.devices.map((device) => device.id).filter((id) => !locked.includes(id))).toEqual(['router'])
    }
  })
})

describe('cafeGuestWifi', () => {
  it('starts broken: the guest phone reaches the till and the office PC (no ACL yet)', () => {
    expect(results(cafeGuestWifi.lab.state, cafeGuestWifi.solvedWhen)).toEqual([false, false, true, true])
  })

  it('is solved by an inbound extended ACL on the guest port', () => {
    expect(results(blockGuests(cafeGuestWifi.lab.state), cafeGuestWifi.solvedWhen)).toEqual([true, true, true, true])
  })

  it('is not solved by a standard ACL that cuts the guests off the internet too', () => {
    expect(results(blockGuestsEverywhere(cafeGuestWifi.lab.state), cafeGuestWifi.solvedWhen)).toEqual([true, true, false, true])
  })
})

describe('officeSharedIp', () => {
  it('starts broken: the provider has no route back to the private office network', () => {
    expect(results(officeSharedIp.lab.state, officeSharedIp.solvedWhen)).toEqual([false, false])
  })

  it('is solved by PAT (overload) on the office router', () => {
    expect(results(overloadOffice(officeSharedIp.lab.state), officeSharedIp.solvedWhen)).toEqual([true, true])
  })
})
