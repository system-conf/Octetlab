import { describe, expect, it } from 'vitest'
import { catalogDevice, testSwitch } from '../core/testCli'
import { AclCli } from './testAclCli'

describe('ACL CLI: numbered lists', () => {
  it('adds standard entries 10, 20, … and keeps host / wildcard forms', () => {
    const cli = new AclCli()
    expect(cli.configure('access-list 10 permit 192.168.1.77 0.0.0.255', 'access-list 10 deny host 10.0.0.5', 'access-list 10 permit 10.0.0.6', 'access-list 10 permit any log')).toEqual([])
    expect(cli.device.features?.accessLists?.lists).toEqual([
      {
        name: '10',
        type: 'standard',
        entries: [
          { seq: 10, kind: 'standard', action: 'permit', source: { address: '192.168.1.0', wildcard: '0.0.0.255' } },
          { seq: 20, kind: 'standard', action: 'deny', source: { address: '10.0.0.5', wildcard: '0.0.0.0' } },
          { seq: 30, kind: 'standard', action: 'permit', source: { address: '10.0.0.6', wildcard: '0.0.0.0' } },
          { seq: 40, kind: 'standard', action: 'permit', source: { address: '0.0.0.0', wildcard: '255.255.255.255' }, log: true },
        ],
      },
    ])
  })

  it('parses the extended forms: protocols, ports by name or number, established, icmp names', () => {
    const cli = new AclCli()
    cli.configure(
      'access-list 101 permit tcp 192.168.1.0 0.0.0.255 host 10.0.0.5 eq www',
      'access-list 101 permit tcp any any established',
      'access-list 101 deny udp any range 1000 2000 any eq 53 log',
      'access-list 101 deny icmp any any echo',
      'access-list 101 permit icmp any any 3 13',
      'access-list 101 permit ip any any',
    )
    const entries = cli.device.features?.accessLists?.lists[0]?.entries ?? []
    expect(entries.map((entry) => entry.seq)).toEqual([10, 20, 30, 40, 50, 60])
    expect(entries[0]).toEqual({
      seq: 10,
      kind: 'extended',
      action: 'permit',
      protocol: 'tcp',
      source: { address: '192.168.1.0', wildcard: '0.0.0.255' },
      destination: { address: '10.0.0.5', wildcard: '0.0.0.0' },
      destinationPort: { op: 'eq', port: 80 },
    })
    expect(entries[1]).toMatchObject({ established: true })
    expect(entries[2]).toMatchObject({ protocol: 'udp', sourcePort: { op: 'range', from: 1000, to: 2000 }, destinationPort: { op: 'eq', port: 53 }, log: true })
    expect(entries[3]).toMatchObject({ protocol: 'icmp', action: 'deny', icmpType: 8 })
    expect(entries[4]).toMatchObject({ icmpType: 3, icmpCode: 13 })
  })

  it('rejects bad ports and port ranges; no access-list removes the whole list', () => {
    const cli = new AclCli()
    expect(cli.configure('access-list 101 permit tcp any any eq nosuchport')).toEqual(['% Unknown port name or number: nosuchport'])
    expect(cli.type('access-list 101 permit tcp any any range 90 80')).toEqual(['% Invalid port range'])
    cli.typeAll('access-list 10 permit any', 'access-list 10 deny host 1.1.1.1')
    cli.type('no access-list 10 deny host 1.1.1.1')
    expect(cli.device.features).toBeUndefined()
  })

  it('the number decides the type; out-of-range numbers are refused by the parser', () => {
    const cli = new AclCli()
    expect(cli.configure('access-list 1300 permit 10.0.0.0 0.255.255.255', 'access-list 2000 permit ip any any')).toEqual([])
    expect(cli.device.features?.accessLists?.lists.map((list) => [list.name, list.type])).toEqual([
      ['1300', 'standard'],
      ['2000', 'extended'],
    ])
    expect(cli.type('access-list 250 permit any').at(-2)).toBe("% Invalid input detected at '^' marker.")
  })
})

describe('ACL CLI: named lists and the sub-mode', () => {
  it('enters the sub-mode with the IOS prompt and adds entries', () => {
    const cli = new AclCli()
    cli.configure('ip access-list extended BLOCK_WEB')
    expect(cli.prompt).toBe('Router(config-ext-nacl)#')
    expect(cli.typeAll('remark No web for guests', 'deny tcp 192.168.20.0 0.0.0.255 any eq www', 'permit ip any any')).toEqual([])
    expect(cli.device.features?.accessLists?.lists[0]?.entries.map((entry) => [entry.seq, entry.kind])).toEqual([
      [10, 'remark'],
      [20, 'extended'],
      [30, 'extended'],
    ])
    cli.type('exit')
    cli.type('ip access-list standard MGMT')
    expect(cli.prompt).toBe('Router(config-std-nacl)#')
  })

  it('refuses the other type\'s form, type conflicts and invalid names', () => {
    const cli = new AclCli()
    cli.configure('ip access-list standard MGMT')
    expect(cli.type('permit tcp any any')).toEqual(["% Invalid input detected at '^' marker."])
    cli.type('exit')
    expect(cli.type('ip access-list extended MGMT')).toEqual(['% Access-list type conflicts with existing type'])
    expect(cli.type('ip access-list standard 150')).toEqual(['% Invalid access list name.'])
    expect(cli.type('ip access-list standard 1abc')).toEqual(['% Invalid access list name.'])
    expect(cli.type('ip access-list standard 15')).toEqual([])
    expect(cli.state.mode).toEqual({ kind: 'accessList', listType: 'standard', name: '15' })
  })

  it('removes entries with no permit … and lists with no ip access-list', () => {
    const cli = new AclCli()
    cli.configure('ip access-list extended E', 'permit tcp any any eq 80', 'deny ip any any', 'no permit tcp any any eq www')
    expect(cli.device.features?.accessLists?.lists[0]?.entries.map((entry) => entry.seq)).toEqual([20])
    cli.typeAll('exit', 'no ip access-list extended E')
    expect(cli.device.features).toBeUndefined()
  })

  it('resequences with the given or the default numbers and checks the maximum', () => {
    const cli = new AclCli()
    cli.configure('access-list 10 permit host 1.1.1.1', 'access-list 10 permit host 2.2.2.2', 'access-list 10 permit host 3.3.3.3')
    cli.type('ip access-list resequence 10 100 5')
    expect(cli.device.features?.accessLists?.lists[0]?.entries.map((entry) => entry.seq)).toEqual([100, 105, 110])
    cli.type('ip access-list resequence 10')
    expect(cli.device.features?.accessLists?.lists[0]?.entries.map((entry) => entry.seq)).toEqual([10, 20, 30])
    expect(cli.type('ip access-list resequence 10 2147483640 10')).toEqual(['Exceeded maximum sequence number.'])
    expect(cli.type('ip access-list resequence NOPE')).toEqual(['% Access list NOPE does not exist'])
  })

  it('an entry past the maximum sequence number is refused', () => {
    const cli = new AclCli()
    cli.configure('access-list 10 permit host 1.1.1.1', 'ip access-list resequence 10 2147483640 1')
    expect(cli.type('access-list 10 permit any')).toEqual(['Exceeded maximum sequence number.'])
  })
})

describe('ACL CLI: bindings', () => {
  it('binds ip access-group in / out on a routed port and removes it with no', () => {
    const cli = new AclCli()
    cli.configure('interface g0/0', 'ip access-group 101 in', 'ip access-group BLOCK out')
    const port = cli.device.ports.find((candidate) => candidate.id === 'Gi0/0')
    expect(port?.role === 'routed' ? port.l3.features : undefined).toEqual({ accessGroups: { in: '101', out: 'BLOCK' } })
    cli.type('no ip access-group OTHER out')
    expect(cli.config()).toContain(' ip access-group BLOCK out')
    cli.typeAll('no ip access-group 101 in', 'no ip access-group out')
    const after = cli.device.ports.find((candidate) => candidate.id === 'Gi0/0')
    expect(after?.role === 'routed' ? after.l3.features : 'switched').toBeUndefined()
  })

  it('refuses switchports of an L3 switch with a lab hint; binds its SVIs', () => {
    const cli = new AclCli(catalogDevice('l3Switch24', 'l3', '00:D0:BA:00:00:03'))
    cli.configure('interface g1/0/1')
    expect(cli.type('ip access-group 10 in')).toEqual(['{acl:cli.switchportGroup}'])
    cli.typeAll('exit', 'interface vlan 1', 'ip access-group 10 in')
    expect(cli.device.switching?.svis[0]?.l3.features).toEqual({ accessGroups: { in: '10' } })
  })

  it('a plain switch has no ACL commands', () => {
    const cli = new AclCli(testSwitch())
    expect(cli.configure('access-list 10 permit any')).toContain("% Invalid input detected at '^' marker.")
  })

  it('sets access-class on vty lines only', () => {
    const cli = new AclCli()
    cli.configure('line vty 0 4', 'access-class 10 in')
    expect(cli.device.features?.management?.lines?.vty?.accessClass).toEqual({ in: '10' })
    cli.type('no access-class 10 in')
    expect(cli.device.features?.management?.lines?.vty).toBeUndefined()
    cli.typeAll('exit', 'line con 0')
    expect(cli.type('access-class 10 in')).toEqual(['{acl:cli.vtyOnly}'])
  })
})
