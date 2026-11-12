// O3 golden tests (docs/SIMULATION.md §10.2) on every exercise (exerciseDefinitions), at the start and
// after the hint-3 fix: the simulator's SimSolveChecker gives the rule engine's SolveChecker results, and
// SimTerminal prints the rule engine's text for a scripted command list on every host with a terminal.
// A lab with ACL / NAT (pack 5.2) is not compared: the rule engine ignores both (§10.3.7).
import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { DeviceAddresses, solveChecker } from '../../engine'
import { exerciseDefinitions } from '../../scenarios/exerciseDefinitions'
import { SimSolveChecker } from '../terminal'
import { Divergences } from './Divergences'
import { EXERCISE_FIXES } from './exerciseFixes'
import { OracleTally } from './OracleChecks'
import { OracleSimulation } from './OracleSimulation'
import { TerminalChecks } from './TerminalChecks'

interface GoldenCase {
  id: string
  stage: 'start' | 'fixed'
  state: NetworkState
}

const allCases: GoldenCase[] = exerciseDefinitions.flatMap((exercise) => {
  const fix = EXERCISE_FIXES[exercise.id]
  if (!fix) throw new Error(`no hint-3 fix for exercise ${exercise.id}`)
  return [
    { id: exercise.id, stage: 'start' as const, state: exercise.lab.state },
    { id: exercise.id, stage: 'fixed' as const, state: fix(exercise.lab.state) },
  ]
})

/** Cases the oracle compares; the others use ACL / NAT. */
const cases = allCases.filter((golden) => !Divergences.securityPolicies(golden.state))
const skipped = allCases.filter((golden) => Divergences.securityPolicies(golden.state))

function conditionsOf(id: string) {
  const exercise = exerciseDefinitions.find((candidate) => candidate.id === id)
  if (!exercise) throw new Error(`unknown exercise ${id}`)
  return exercise.solvedWhen
}

describe('exercises: simulator vs rule engine (golden)', () => {
  it('covers every exercise at the start, and skips exactly the fixed ACL / NAT labs', () => {
    expect(new Set(cases.map((golden) => golden.id)).size).toBe(exerciseDefinitions.length)
    expect(cases.filter((golden) => golden.stage === 'start')).toHaveLength(exerciseDefinitions.length)
    expect(skipped.map((golden) => `${golden.id} ${golden.stage}`).sort()).toEqual(['cafeGuestWifi fixed', 'officeSharedIp fixed'])
  })

  it.each(cases.map((golden): [string, string, GoldenCase] => [golden.id, golden.stage, golden]))('%s (%s): SimSolveChecker = SolveChecker', (_id, stage, golden) => {
    const conditions = conditionsOf(golden.id)
    const expected = solveChecker.check(golden.state, conditions)
    expect(SimSolveChecker.check(golden.state, conditions)).toEqual(expected)
    expect(expected.every((result) => result.ok)).toBe(stage === 'fixed')
  })

  it.each(cases.map((golden): [string, string, GoldenCase] => [golden.id, golden.stage, golden]))('%s (%s): SimTerminal = runCommand', (_id, _stage, golden) => {
    const tally = new OracleTally()
    const terminal = new TerminalChecks(golden.state, new OracleSimulation(golden.state), tally)
    const targets = golden.state.devices.flatMap((device) => DeviceAddresses.of(device).slice(0, 1))
    const hosts = golden.state.devices.filter((device) => device.host !== undefined && TerminalChecks.hasTerminal(golden.state, device.id))
    const mismatches = hosts.flatMap((host) => TerminalChecks.script(targets).flatMap((line) => terminal.check(host.id, line)))
    if (mismatches.length > 0) console.error(`${golden.id} (${golden.stage}) lab: ${JSON.stringify(golden.state)}`)
    expect(mismatches).toEqual([])
    expect(tally.compared.terminal ?? 0).toBeGreaterThan(0)
  })
})
