// Pure edits of a device's access lists (pack 5.2, docs/SECURITY_PACK.md §7). Every method returns a new
// Device (or an IOS error text) and never mutates. Factory values are absent keys: a device without lists
// has no `features.accessLists`, so replaying a running-config reproduces the same device.
// Sequence rules (https://www.cisco.com/en/US/docs/ios-xml/ios/sec_data_acl/configuration/15-1mt/Refining_an_IP_Access_List.html):
// an entry without a number goes last with "10 greater than the last sequence number"; a number already
// used → "Duplicate sequence number."; past 2147483647 → "Exceeded maximum sequence number.".
import type { AccessList, AccessListType, AclEntry, Device, DeviceFeatures } from '../../domain'
import { AclSyntax, MAX_SEQ, SEQ_STEP } from './AclSyntax'

export const DUPLICATE_SEQ = 'Duplicate sequence number.'
export const EXCEEDED_SEQ = 'Exceeded maximum sequence number.'

/** An entry before it has its sequence number. */
export type AclEntryDraft = AclEntry extends infer Entry ? (Entry extends AclEntry ? Omit<Entry, 'seq'> : never) : never

export type AclEditResult = { readonly ok: true; readonly device: Device } | { readonly ok: false; readonly error: string }

/** Same rule as IOS would print it (key order and absent defaults do not matter). */
function sameEntry(draft: AclEntryDraft, entry: AclEntry): boolean {
  return AclSyntax.entryText({ ...draft, seq: entry.seq }) === AclSyntax.entryText(entry)
}

export class AclEdits {
  static listsOf(device: Device): readonly AccessList[] {
    return device.features?.accessLists?.lists ?? []
  }

  static find(device: Device, name: string): AccessList | undefined {
    return AclEdits.listsOf(device).find((list) => list.name === name)
  }

  /** The lists after `change`; an empty set removes `features.accessLists`. */
  static withLists(device: Device, lists: readonly AccessList[]): Device {
    const features: DeviceFeatures = { ...device.features }
    if (lists.length === 0) delete features.accessLists
    else features.accessLists = { lists: [...lists] }
    const copy = { ...device }
    if (Object.keys(features).length === 0) delete copy.features
    else copy.features = features
    return copy
  }

  /** Creates the list when missing (`ip access-list standard X` creates it at once). */
  static ensure(device: Device, name: string, type: AccessListType): Device {
    if (AclEdits.find(device, name) !== undefined) return device
    return AclEdits.withLists(device, [...AclEdits.listsOf(device), { name, type, entries: [] }])
  }

  static remove(device: Device, name: string): Device {
    return AclEdits.withLists(
      device,
      AclEdits.listsOf(device).filter((list) => list.name !== name),
    )
  }

  /** Adds an entry to list `name` (created when missing) at `seq`, or last when `seq` is undefined. */
  static add(device: Device, name: string, type: AccessListType, draft: AclEntryDraft, seq?: number): AclEditResult {
    const withList = AclEdits.ensure(device, name, type)
    const list = AclEdits.find(withList, name)
    if (list === undefined) throw new Error(`Access list ${name} was not created`)
    const last = list.entries.reduce((max, entry) => Math.max(max, entry.seq), 0)
    const next = seq ?? last + SEQ_STEP
    if (next > MAX_SEQ) return { ok: false, error: EXCEEDED_SEQ }
    if (list.entries.some((entry) => entry.seq === next)) return { ok: false, error: DUPLICATE_SEQ }
    const entry: AclEntry = { ...draft, seq: next }
    const entries = [...list.entries, entry].sort((first, second) => first.seq - second.seq)
    return { ok: true, device: AclEdits.replace(withList, { ...list, entries }) }
  }

  /** `no <seq>` in the list's sub-mode; an unknown number changes nothing. */
  static removeSeq(device: Device, name: string, seq: number): Device {
    const list = AclEdits.find(device, name)
    if (list === undefined) return device
    return AclEdits.replace(device, { ...list, entries: list.entries.filter((entry) => entry.seq !== seq) })
  }

  /** `no permit …` in the sub-mode: removes the first entry with the same content. */
  static removeMatching(device: Device, name: string, draft: AclEntryDraft): Device {
    const list = AclEdits.find(device, name)
    const target = list?.entries.find((entry) => sameEntry(draft, entry))
    if (list === undefined || target === undefined) return device
    return AclEdits.replace(device, { ...list, entries: list.entries.filter((entry) => entry !== target) })
  }

  /** `ip access-list resequence <name> <start> <step>`. */
  static resequence(device: Device, name: string, start: number, step: number): AclEditResult {
    const list = AclEdits.find(device, name)
    if (list === undefined) return { ok: true, device }
    if (list.entries.length > 0 && start + step * (list.entries.length - 1) > MAX_SEQ) return { ok: false, error: EXCEEDED_SEQ }
    const entries = list.entries.map((entry, index) => ({ ...entry, seq: start + step * index }))
    return { ok: true, device: AclEdits.replace(device, { ...list, entries }) }
  }

  private static replace(device: Device, list: AccessList): Device {
    return AclEdits.withLists(
      device,
      AclEdits.listsOf(device).map((candidate) => (candidate.name === list.name ? list : candidate)),
    )
  }
}
