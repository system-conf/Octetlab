// Turns zod issues and StateInvariants violations into `lab:` messages for the UI. Paths name array
// items by their `id` when they have one (`state.devices[router1].ports[Gi0/0].l2.accessVlan`).
import type { z } from 'zod'
import type { InvariantViolation } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'

/** More problems than this are summarised in one `lab:import.moreErrors` line. */
export const MAX_REPORTED_ERRORS = 20

type Issue = z.core.$ZodIssue
type PathKey = PropertyKey

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function listValues(values: readonly unknown[]): string {
  return values.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(', ')
}

export class LabMessages {
  /** zod issues of `input` → messages (at most MAX_REPORTED_ERRORS + a summary line). */
  fromIssues(input: unknown, issues: readonly Issue[]): LocalizedMessage[] {
    return this.limit(issues.map((issue) => this.fromIssue(input, issue, [])))
  }

  fromViolations(violations: readonly InvariantViolation[]): LocalizedMessage[] {
    return this.limit(violations.map((violation) => this.fromViolation(violation)))
  }

  /** `state.devices[router1].ports[0]`: item ids where the data has them, indexes otherwise. */
  formatPath(input: unknown, path: readonly PathKey[]): string {
    let text = ''
    let node: unknown = input
    for (const key of path) {
      const child = isRecord(node) ? node[key] : undefined
      if (typeof key === 'number') {
        const id = isRecord(child) && typeof child.id === 'string' && child.id !== '' ? child.id : String(key)
        text += `[${id}]`
      } else {
        text += text === '' ? String(key) : `.${String(key)}`
      }
      node = child
    }
    return text === '' ? '/' : text
  }

  private limit(messages: LocalizedMessage[]): LocalizedMessage[] {
    if (messages.length <= MAX_REPORTED_ERRORS) return messages
    const rest = messages.length - MAX_REPORTED_ERRORS
    return [...messages.slice(0, MAX_REPORTED_ERRORS), localizedMessage('lab:import.moreErrors', { count: rest })]
  }

  private fromIssue(input: unknown, issue: Issue, prefix: readonly PathKey[]): LocalizedMessage {
    const fullPath = [...prefix, ...issue.path]
    const path = this.formatPath(input, fullPath)
    switch (issue.code) {
      case 'invalid_type':
        if (issue.expected === 'never') return localizedMessage('lab:schema.unknownKey', { path, key: String(fullPath.at(-1) ?? '') })
        if (issue.expected === 'int') return localizedMessage('lab:schema.notInteger', { path })
        return localizedMessage('lab:schema.invalidType', { path, expected: issue.expected })
      case 'invalid_value':
        return localizedMessage('lab:schema.invalidValue', { path, allowed: listValues(issue.values) })
      case 'unrecognized_keys':
        return localizedMessage('lab:schema.unknownKey', { path, key: issue.keys.join(', ') })
      case 'too_small':
        return localizedMessage('lab:schema.tooSmall', { path, minimum: String(issue.minimum) })
      case 'too_big':
        return localizedMessage('lab:schema.tooBig', { path, maximum: String(issue.maximum) })
      case 'invalid_union':
        return this.fromUnion(input, issue, fullPath, path)
      case 'invalid_key': {
        // A record key (`layout.devices.<id>`): report why the key itself is wrong.
        const keyIssue = issue.issues[0]
        return keyIssue === undefined ? localizedMessage('lab:schema.invalid', { path }) : this.fromIssue(input, keyIssue, fullPath)
      }
      case 'custom':
        return this.fromCustom(issue.params, path)
      default:
        return localizedMessage('lab:schema.invalid', { path })
    }
  }

  /**
   * A discriminated union names its options. A plain union reports the branch that got furthest
   * into the data (deepest issue path, then fewest issues); when every branch fails at the value
   * itself, the value is simply invalid.
   */
  private fromUnion(input: unknown, issue: z.core.$ZodIssueInvalidUnion, fullPath: PathKey[], path: string): LocalizedMessage {
    if (issue.errors.length === 0) {
      const options = 'options' in issue ? (issue.options ?? []) : []
      return options.length > 0
        ? localizedMessage('lab:schema.invalidValue', { path, allowed: listValues(options) })
        : localizedMessage('lab:schema.invalid', { path })
    }
    const depth = (branch: readonly Issue[]): number => Math.max(...branch.map((nested) => nested.path.length))
    const best = [...issue.errors].sort((x, y) => depth(y) - depth(x) || x.length - y.length)[0]
    const first = best?.[0]
    if (best === undefined || first === undefined || depth(best) === 0) return localizedMessage('lab:schema.invalid', { path })
    return this.fromIssue(input, first, fullPath)
  }

  /** Refinements of src/lab/schemas name their rule in `params` (see idSchema, labLayoutSchema). */
  private fromCustom(params: Record<string, unknown> | undefined, path: string): LocalizedMessage {
    if (params?.reason === 'reservedId') return localizedMessage('lab:schema.reservedId', { path })
    if (typeof params?.maximum === 'number') return localizedMessage('lab:schema.tooBig', { path, maximum: String(params.maximum) })
    return localizedMessage('lab:schema.invalid', { path })
  }

  private fromViolation(violation: InvariantViolation): LocalizedMessage {
    const deviceId = violation.deviceId ?? ''
    const portId = violation.portId ?? ''
    const linkId = violation.linkId ?? ''
    switch (violation.code) {
      case 'duplicateDeviceId':
        return localizedMessage('lab:invariant.duplicateDeviceId', { deviceId })
      case 'duplicateLinkId':
        return localizedMessage('lab:invariant.duplicateLinkId', { linkId })
      case 'duplicatePortId':
        return localizedMessage('lab:invariant.duplicatePortId', { deviceId, portId })
      case 'badInterfaceId':
        return localizedMessage('lab:invariant.badInterfaceId', { deviceId, portId })
      case 'invalidMac':
        return violation.portId === undefined
          ? localizedMessage('lab:invariant.invalidBaseMac', { deviceId })
          : localizedMessage('lab:invariant.invalidMac', { deviceId, portId })
      case 'duplicateMac':
        return localizedMessage('lab:invariant.duplicateMac', { deviceId, portId })
      case 'vlanOutOfRange':
        return violation.portId === undefined
          ? localizedMessage('lab:invariant.vlanOutOfRange', { deviceId })
          : localizedMessage('lab:invariant.vlanOutOfRangeOnPort', { deviceId, portId })
      case 'missingDefaultVlan':
        return localizedMessage('lab:invariant.missingDefaultVlan', { deviceId })
      case 'invalidLink':
        return localizedMessage(`lab:invariant.invalidLink.${violation.reason ?? 'unknownPort'}`, { linkId })
      case 'duplicateAclName':
      case 'aclNumberOutOfRange':
      case 'duplicateAclSeq':
      case 'duplicateNatPool':
      case 'duplicateUser':
        return localizedMessage(`lab:invariant.${violation.code}`, { deviceId, name: violation.name ?? '' })
    }
  }
}
