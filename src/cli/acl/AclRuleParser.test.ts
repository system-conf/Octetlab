import { describe, expect, it } from 'vitest'
import { AclRuleParser } from './AclRuleParser'
import { AclSyntax } from './AclSyntax'
import { AclCli } from './testAclCli'

describe('AclRuleParser', () => {
  it('parses what running-config writes, the same way the CLI tree does', () => {
    const lines = [
      'permit tcp 192.168.1.0 0.0.0.255 host 10.0.0.5 eq www',
      'permit tcp any any established log',
      'deny udp any range 1000 2000 any eq domain',
      'deny icmp any any echo',
      'permit icmp any any 3 13',
      'permit ip any any',
    ]
    const cli = new AclCli()
    cli.configure(...lines.map((line) => `access-list 101 ${line}`))
    const viaCli = cli.device.features?.accessLists?.lists[0]?.entries ?? []
    lines.forEach((line, index) => {
      const parsed = AclRuleParser.parse('extended', line)
      expect(parsed.ok && { ...parsed.draft, seq: (index + 1) * 10 }).toEqual(viaCli[index])
      // Numbers with a name print as the name (IOS): "3 13" → "administratively-prohibited".
      expect(parsed.ok && AclSyntax.entryText({ ...parsed.draft, seq: 1 })).toBe(line.replace('3 13', 'administratively-prohibited'))
    })
  })

  it('standard forms and remarks', () => {
    expect(AclRuleParser.parse('standard', 'permit 10.0.0.7 0.0.0.255')).toEqual({
      ok: true,
      draft: { kind: 'standard', action: 'permit', source: { address: '10.0.0.0', wildcard: '0.0.0.255' } },
    })
    expect(AclRuleParser.parse('standard', 'deny 10.0.0.7')).toMatchObject({ ok: true, draft: { source: { address: '10.0.0.7', wildcard: '0.0.0.0' } } })
    expect(AclRuleParser.parse('standard', 'remark  Staff   only')).toEqual({ ok: true, draft: { kind: 'remark', text: 'Staff only' } })
  })

  it('reports problems', () => {
    expect(AclRuleParser.parse('standard', 'allow any')).toEqual({ ok: false, problem: 'action' })
    expect(AclRuleParser.parse('standard', 'permit 300.1.1.1')).toEqual({ ok: false, problem: 'address' })
    expect(AclRuleParser.parse('extended', 'permit gre any any')).toEqual({ ok: false, problem: 'protocol' })
    expect(AclRuleParser.parse('extended', 'permit tcp any any eq nope')).toEqual({ ok: false, problem: 'port' })
    expect(AclRuleParser.parse('extended', 'permit tcp 10.0.0.0 any')).toEqual({ ok: false, problem: 'address' })
    expect(AclRuleParser.parse('standard', 'permit any extra words')).toEqual({ ok: false, problem: 'extra', text: 'extra words' })
    expect(AclRuleParser.parse('standard', 'remark')).toEqual({ ok: false, problem: 'remark' })
  })
})
