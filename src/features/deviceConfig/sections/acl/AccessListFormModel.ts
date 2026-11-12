// Form model of the access-list card (pack 5.2, docs/SECURITY_PACK.md §4): every list is a name, a type
// and its entries as IOS text lines (one entry per line, in order). Saving renumbers the entries 10, 20, …
// like a running-config replay does; rules are parsed with the CLI's own grammar (AclRuleParser).
import { AclEdits } from '../../../../cli/acl/AclEdits'
import { AclRuleParser } from '../../../../cli/acl/AclRuleParser'
import { AclSyntax, SEQ_STEP } from '../../../../cli/acl/AclSyntax'
import type { AccessList, AccessListType, AclEntry, Device } from '../../../../domain'
import type { LocalizedMessage } from '../../../../domain/Messages'
import { localizedMessage } from '../../../../i18n/messageKeys'
import { newRowKey, type FieldErrors } from '../../model/formTypes'

export const ACL_TYPES: readonly AccessListType[] = ['standard', 'extended']

export interface AccessListDraft {
  key: string
  name: string
  type: AccessListType
  /** One IOS entry per line, without sequence numbers. */
  entriesText: string
}

export type AccessListErrors = FieldErrors<'name' | 'entries'>

const PROBLEM_KEYS = {
  action: 'acl:section.problems.action',
  address: 'acl:section.problems.address',
  protocol: 'acl:section.problems.protocol',
  port: 'acl:section.problems.port',
  extra: 'acl:section.problems.extra',
  remark: 'acl:section.problems.remark',
} as const

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function nameError(draft: AccessListDraft, all: readonly AccessListDraft[]): LocalizedMessage | undefined {
  const name = draft.name.trim()
  if (name === '') return localizedMessage('acl:section.errors.nameRequired')
  const fits = AclSyntax.isNumbered(name) ? AclSyntax.numberedType(name) === draft.type : /^[^\d\s]\S*$/.test(name)
  if (!fits) return localizedMessage('acl:section.errors.nameInvalid')
  if (all.filter((other) => other.name.trim() === name).length > 1) return localizedMessage('acl:section.errors.nameDuplicate')
  return undefined
}

function entriesError(draft: AccessListDraft): LocalizedMessage | undefined {
  const all = lines(draft.entriesText)
  for (const [index, line] of all.entries()) {
    const parsed = AclRuleParser.parse(draft.type, line)
    if (parsed.ok) continue
    return localizedMessage(PROBLEM_KEYS[parsed.problem], { line: index + 1, text: parsed.text ?? '' })
  }
  return undefined
}

export class AccessListFormModel {
  static toDrafts(device: Device): AccessListDraft[] {
    return AclEdits.listsOf(device).map((list) => ({
      key: newRowKey(),
      name: list.name,
      type: list.type,
      entriesText: [...list.entries]
        .sort((first, second) => first.seq - second.seq)
        .map((entry) => AclSyntax.entryText(entry))
        .join('\n'),
    }))
  }

  static newDraft(): AccessListDraft {
    return { key: newRowKey(), name: '', type: 'standard', entriesText: '' }
  }

  static validate(drafts: readonly AccessListDraft[]): AccessListErrors[] {
    return drafts.map((draft) => {
      const errors: AccessListErrors = {}
      const name = nameError(draft, drafts)
      if (name !== undefined) errors.name = name
      const entries = entriesError(draft)
      if (entries !== undefined) errors.entries = entries
      return errors
    })
  }

  /** The device with the drafts as its lists (valid drafts only: call validate first). */
  static apply(device: Device, drafts: readonly AccessListDraft[]): Device {
    const lists: AccessList[] = drafts.map((draft) => {
      const entries: AclEntry[] = []
      for (const line of lines(draft.entriesText)) {
        const parsed = AclRuleParser.parse(draft.type, line)
        if (parsed.ok) entries.push({ ...parsed.draft, seq: SEQ_STEP * (entries.length + 1) })
      }
      return { name: draft.name.trim(), type: draft.type, entries }
    })
    return AclEdits.withLists(device, lists)
  }
}
