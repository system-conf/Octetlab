import { describe, expect, it } from 'vitest'
import { testRouter } from '../../../../cli/core/testCli'
import { AccessListFormModel, type AccessListDraft } from './AccessListFormModel'

const draft = (patch: Partial<AccessListDraft>): AccessListDraft => ({ key: 'k', name: 'GUEST', type: 'extended', entriesText: '', ...patch })

describe('AccessListFormModel', () => {
  it('saves lists with entries renumbered 10, 20, … and reads them back as text', () => {
    const device = AccessListFormModel.apply(testRouter(), [
      draft({ entriesText: 'remark Web only\n\npermit tcp any any eq 80\n deny ip any any ' }),
      draft({ key: 'k2', name: '10', type: 'standard', entriesText: 'permit 192.168.1.0 0.0.0.255' }),
    ])
    expect(device.features?.accessLists?.lists.map((list) => [list.name, list.entries.map((entry) => entry.seq)])).toEqual([
      ['GUEST', [10, 20, 30]],
      ['10', [10]],
    ])
    expect(AccessListFormModel.toDrafts(device).map((row) => row.entriesText)).toEqual([
      'remark Web only\npermit tcp any any eq www\ndeny ip any any',
      'permit 192.168.1.0 0.0.0.255',
    ])
    expect(AccessListFormModel.apply(device, []).features).toBeUndefined()
  })

  it('validates names and entry lines', () => {
    const errors = AccessListFormModel.validate([
      draft({ name: '' }),
      draft({ name: '150', type: 'standard' }),
      draft({ name: 'A', entriesText: 'permit tcp any any\npermit tcp any any eq nope' }),
      draft({ name: 'A' }),
    ])
    expect(errors[0]?.name?.key).toBe('acl:section.errors.nameRequired')
    expect(errors[1]?.name?.key).toBe('acl:section.errors.nameInvalid')
    expect(errors[2]?.name?.key).toBe('acl:section.errors.nameDuplicate')
    expect(errors[2]?.entries).toEqual({ key: 'acl:section.problems.port', params: { line: 2, text: '' } })
  })
})
