import { describe, expect, it } from 'vitest'
import type { AccessList } from '../../domain'
import { FactoryReset } from '../core/FactoryReset'
import { AclCli } from './testAclCli'

function configured(): AclCli {
  const cli = new AclCli()
  cli.configure(
    'access-list 10 remark Staff only',
    'access-list 10 permit 192.168.10.0 0.0.0.255',
    'access-list 10 permit host 10.0.0.9',
    'access-list 101 permit tcp host 198.92.32.130 any established',
    'access-list 101 deny ip 150.136.0.0 0.0.255.255 224.0.0.0 15.255.255.255',
    'ip access-list extended GUEST',
    'remark Guests reach the web only',
    'permit udp any any eq domain',
    'permit tcp 192.168.20.0 0.0.0.255 any eq www',
    'deny icmp any any echo log',
    'exit',
    'ip access-list standard EMPTY',
    'exit',
    'interface g0/0',
    'ip address 192.168.10.1 255.255.255.0',
    'ip access-group GUEST in',
    'ip access-group 10 out',
    'end',
  )
  return cli
}

describe('ACL CLI: show output', () => {
  it('show access-lists prints the IOS layout with counters', () => {
    const cli = configured()
    cli.withCounters({ '101': { 10: 4304 }, '10': { 20: 1 }, GUEST: { 30: 2 } })
    expect(cli.type('show access-lists')).toEqual([
      'Standard IP access list 10',
      '    20 permit 192.168.10.0, wildcard bits 0.0.0.255 (1 match)',
      '    30 permit 10.0.0.9',
      'Extended IP access list 101',
      '    10 permit tcp host 198.92.32.130 any established (4304 matches)',
      '    20 deny   ip 150.136.0.0 0.0.255.255 224.0.0.0 15.255.255.255',
      'Extended IP access list GUEST',
      '    20 permit udp any any eq domain',
      '    30 permit tcp 192.168.20.0 0.0.0.255 any eq www (2 matches)',
      '    40 deny   icmp any any echo log',
      'Standard IP access list EMPTY',
    ])
    expect(cli.type('show ip access-lists 101')).toEqual([
      'Extended IP access list 101',
      '    10 permit tcp host 198.92.32.130 any established (4304 matches)',
      '    20 deny   ip 150.136.0.0 0.0.255.255 224.0.0.0 15.255.255.255',
    ])
    expect(cli.type('show access-lists NOPE')).toEqual([])
  })

  it('show ip interface prints the access-group lines', () => {
    const cli = configured()
    expect(cli.type('show ip interface g0/0')).toEqual([
      'GigabitEthernet0/0 is administratively down, line protocol is down',
      '  Internet address is 192.168.10.1/24',
      '  Outgoing access list is 10',
      '  Inbound  access list is GUEST',
    ])
    expect(cli.type('show ip interface')).toContain('  Internet protocol processing disabled')
  })

  it('clear access-list counters runs a clearTable job', () => {
    const cli = configured()
    cli.type('clear access-list counters')
    expect(cli.last.job).toEqual({ kind: 'clearTable', deviceId: 'r1', table: 'aclCounters' })
  })
})

describe('ACL CLI: running-config', () => {
  it('writes named blocks and numbered lines without sequence numbers, and the interface lines', () => {
    const config = configured().config()
    const from = config.indexOf('ip access-list extended GUEST')
    expect(config.slice(from, from + 13)).toEqual([
      'ip access-list extended GUEST',
      ' remark Guests reach the web only',
      ' permit udp any any eq domain',
      ' permit tcp 192.168.20.0 0.0.0.255 any eq www',
      ' deny icmp any any echo log',
      '!',
      'ip access-list standard EMPTY',
      '!',
      'access-list 10 remark Staff only',
      'access-list 10 permit 192.168.10.0 0.0.0.255',
      'access-list 10 permit 10.0.0.9',
      'access-list 101 permit tcp host 198.92.32.130 any established',
      'access-list 101 deny ip 150.136.0.0 0.0.255.255 224.0.0.0 15.255.255.255',
    ])
    const iface = config.indexOf('interface GigabitEthernet0/0')
    expect(config.slice(iface, iface + 4)).toEqual(['interface GigabitEthernet0/0', ' ip address 192.168.10.1 255.255.255.0', ' ip access-group GUEST in', ' ip access-group 10 out'])
  })

  it('round-trips through CliShell.replay (startup-config parser)', () => {
    const cli = configured()
    const config = cli.config()
    const replayed = cli.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(cli.device)), config.join('\n'))
    // Named blocks come before the numbered lines, so the list order may change; the lists may not.
    const byName = (lists: readonly AccessList[] = []) => [...lists].sort((first, second) => first.name.localeCompare(second.name))
    expect(byName(replayed.features?.accessLists?.lists)).toEqual(byName(cli.device.features?.accessLists?.lists))
    expect(cli.shell.runningConfig(replayed)).toEqual(config)
  })
})
