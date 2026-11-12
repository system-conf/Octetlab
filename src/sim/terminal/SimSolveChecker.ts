import type { AppLinkStatus, NetworkState, SolveCondition } from '../../domain'
import type { ConditionResult } from '../../engine/SolveChecker'
import { AppLinkVerdicts } from '../../net/AppLinkVerdicts'
import { DeviceAddresses } from '../../net/DeviceAddresses'
import { Topology } from '../../net/Topology'
import type { SimulationEngine, SimOptions } from '../contract'
import { createSimulation } from '../createSimulation'
import { SimProbes } from './SimProbes'

/** Address used by the 'internet' condition (as the rule engine's SolveChecker). */
const INTERNET_PROBE_IP = '8.8.8.8'

/**
 * App links on the simulator (docs/SIMULATION.md §10.1): a one-echo ping per link; the device that
 * answered must be powered and of the expected kind (the engine's lab rule, AppLinkVerdicts).
 */
export class SimAppLinks {
  static status(engine: SimulationEngine, deviceId: string): AppLinkStatus[] {
    const device = Topology.of(engine.network()).require(deviceId)
    return (device.host?.appLinks ?? []).map((appLink) => {
      const reach = SimProbes.reach(engine, deviceId, appLink.targetIp)
      const answeringId = reach.answeringDeviceId
      const answering = answeringId === null ? undefined : Topology.of(engine.network()).find(answeringId)
      const owner = answering && DeviceAddresses.has(answering, appLink.targetIp) ? answering : undefined
      return AppLinkVerdicts.of(appLink, reach.result, owner)
    })
  }
}

/**
 * The exercise checker on the simulator: same shape and conditions as the rule engine's SolveChecker.
 * Every `check` builds a fresh, settled engine of `state` and evaluates the conditions in order on it.
 */
export class SimSolveChecker {
  private static readonly shared = new SimSolveChecker()
  private readonly options: SimOptions

  constructor(options: SimOptions = {}) {
    this.options = options
  }

  static check(state: NetworkState, conditions: readonly SolveCondition[]): ConditionResult[] {
    return SimSolveChecker.shared.check(state, conditions)
  }

  check(state: NetworkState, conditions: readonly SolveCondition[]): ConditionResult[] {
    const engine = createSimulation(state, this.options)
    return conditions.map((condition) => ({ condition, ok: this.holds(engine, condition) }))
  }

  private holds(engine: SimulationEngine, condition: SolveCondition): boolean {
    switch (condition.type) {
      case 'internet':
        return SimProbes.reach(engine, condition.fromDeviceId, INTERNET_PROBE_IP).result.ok
      case 'resolves':
        return SimProbes.resolve(engine, condition.fromDeviceId, condition.name).ok
      case 'reachable':
      case 'unreachable': {
        // Both mean the target's current (first) address; 'unreachable' needs one to exist.
        const targetIp = DeviceAddresses.of(Topology.of(engine.network()).require(condition.toDeviceId))[0]
        if (targetIp === undefined) return false
        const reached = SimProbes.reach(engine, condition.fromDeviceId, targetIp).result.ok
        return condition.type === 'reachable' ? reached : !reached
      }
      case 'appLinksOk':
        return SimAppLinks.status(engine, condition.deviceId).every((status) => status.ok)
    }
  }
}
