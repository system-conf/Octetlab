import type { LocalizedMessage } from '../domain/Messages'
import type { NetworkState, SolveCondition } from '../domain'
import type { ConditionResult } from '../engine'
import { localizedMessage } from '../i18n/messageKeys'

/**
 * Turns unmet solve conditions of an exercise into messages for the learner
 * (`session:failedChecks.*`). Messages state the symptom only, never the cause, so the fault
 * stays hidden. Device names are taken from the lab (already localized for exercises).
 */
export class FailedCheckDescriber {
  /** One message per failing condition, without duplicates, in condition order. */
  static describeFailures(state: NetworkState, results: readonly ConditionResult[]): LocalizedMessage[] {
    const unique = new Map<string, LocalizedMessage>()
    for (const result of results) {
      if (result.ok) continue
      const message = FailedCheckDescriber.describe(state, result.condition)
      const identity = JSON.stringify(message)
      if (!unique.has(identity)) unique.set(identity, message)
    }
    return [...unique.values()]
  }

  static describe(state: NetworkState, condition: SolveCondition): LocalizedMessage {
    switch (condition.type) {
      case 'internet':
        return localizedMessage('session:failedChecks.internet', {
          device: FailedCheckDescriber.nameOf(state, condition.fromDeviceId),
        })
      case 'resolves':
        return localizedMessage('session:failedChecks.resolves', {
          device: FailedCheckDescriber.nameOf(state, condition.fromDeviceId),
          name: condition.name,
        })
      case 'reachable':
        return localizedMessage('session:failedChecks.reachable', {
          from: FailedCheckDescriber.nameOf(state, condition.fromDeviceId),
          to: FailedCheckDescriber.nameOf(state, condition.toDeviceId),
        })
      case 'unreachable':
        return localizedMessage('session:failedChecks.unreachable', {
          from: FailedCheckDescriber.nameOf(state, condition.fromDeviceId),
          to: FailedCheckDescriber.nameOf(state, condition.toDeviceId),
        })
      case 'appLinksOk':
        return localizedMessage('session:failedChecks.appLinksOk', {
          device: FailedCheckDescriber.nameOf(state, condition.deviceId),
        })
    }
  }

  /** Display name of a device; falls back to the id so a message is never empty. */
  private static nameOf(state: NetworkState, deviceId: string): string {
    return state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  }
}
