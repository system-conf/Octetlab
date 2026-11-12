import { describe, expect, it } from 'vitest'
import type { ManagementSettings } from '../../../../domain'
import { SecurityFormModel } from './SecurityFormModel'

const CONFIGURED: ManagementSettings = {
  hostname: 'R1',
  domainName: 'lab.local',
  ssh: { rsaKeyBits: 1024, version: 2, timeoutSeconds: 60 },
  users: [{ name: 'admin', secret: 'cisco123', privilege: 15 }, { name: 'guest', password: 'pw' }],
  lines: { vty: { loginLocal: true, transportInput: ['ssh'], execTimeout: { minutes: 5, seconds: 0 }, accessClass: { in: '10' } } },
}

describe('SecurityFormModel', () => {
  it('round-trips the settings and keeps unrelated vty fields', () => {
    const draft = SecurityFormModel.toDraft(CONFIGURED)
    expect(SecurityFormModel.isValid(SecurityFormModel.validate(draft))).toBe(true)
    expect(SecurityFormModel.apply(CONFIGURED, draft)).toEqual(CONFIGURED)
  })

  it('stores factory values as absent keys', () => {
    const draft = { ...SecurityFormModel.toDraft(CONFIGURED), keyBits: '', sshVersion: 'both' as const, timeout: '120', transport: 'all' as const, login: 'line' as const, users: [], domainName: '' }
    expect(SecurityFormModel.apply({ hostname: 'R1', lines: { vty: { loginLocal: true } } }, draft)).toEqual({ hostname: 'R1' })
  })

  it('needs a domain name for keys and checks ranges and users', () => {
    const draft = { ...SecurityFormModel.toDraft({}), keyBits: '1024', retries: '9', users: [{ ...SecurityFormModel.newUser(), name: 'a b' }] }
    const errors = SecurityFormModel.validate(draft)
    expect(errors.fields.keyBits?.key).toBe('remoteAccess:errors.keysNeedDomain')
    expect(errors.fields.retries?.key).toBe('remoteAccess:errors.range')
    expect(errors.users[0]).toMatchObject({ name: { key: 'remoteAccess:errors.userName' }, credential: { key: 'deviceConfig:errors.required' } })
  })
})
