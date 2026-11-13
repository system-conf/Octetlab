import { describe, expect, it } from 'vitest'
import type { FirewallConnection } from '../../sim/contract/FirewallRuntime'
import type { NatTranslation } from '../../sim/contract/SecurityRuntime'
import { FirewallCli, THREE_LEGS } from './firewallTestCli'

const NAT = ['object network WEB', 'host 172.16.0.10', 'nat (dmz,outside) static 203.0.113.10', 'object network LAN', 'subnet 10.0.0.0 255.255.255.0', 'nat (inside,outside) dynamic interface', 'end']

const WEB_FROM_INSIDE: FirewallConnection = {
  id: 1,
  protocol: 'tcp',
  initiator: { ip: '10.0.0.5', port: 51234 },
  responder: { ip: '198.51.100.7', port: 80 },
  inInterface: 'inside',
  outInterface: 'outside',
  state: 'established',
  createdAt: 1_000,
  lastUsedAt: 60_000,
  expiresAt: 3_660_000,
  bytes: 1234,
}

const DNS: FirewallConnection = {
  id: 2,
  protocol: 'udp',
  initiator: { ip: '10.0.0.5', port: 53000 },
  responder: { ip: '198.51.100.53', port: 53 },
  inInterface: 'inside',
  outInterface: 'outside',
  state: 'open',
  createdAt: 50_000,
  lastUsedAt: 50_000,
  expiresAt: 170_000,
  bytes: 120,
}

const INBOUND_WEB: FirewallConnection = {
  id: 3,
  protocol: 'tcp',
  initiator: { ip: '198.51.100.9', port: 40000 },
  responder: { ip: '172.16.0.10', port: 80 },
  inInterface: 'outside',
  outInterface: 'dmz',
  state: 'synSent',
  createdAt: 59_000,
  lastUsedAt: 59_000,
  expiresAt: 3_659_000,
  bytes: 60,
}

const EXPIRED: FirewallConnection = { ...DNS, id: 4, expiresAt: 59_000 }

const PAT_ROW: NatTranslation = {
  protocol: 'tcp',
  insideLocal: { ip: '10.0.0.5', port: 51234 },
  insideGlobal: { ip: '203.0.113.2', port: 51234 },
  outsideLocal: { ip: '198.51.100.7', port: 80 },
  outsideGlobal: { ip: '198.51.100.7', port: 80 },
  origin: 'dynamic',
  createdAt: 1_000,
  lastUsedAt: 55_000,
  expiresAt: 85_000,
}

function showCli(): FirewallCli {
  const cli = new FirewallCli()
  cli.configure(...THREE_LEGS, ...NAT, 'terminal length 0')
  cli.now = 60_000
  return cli
}

describe('firewall CLI: show commands', () => {
  it('show nameif lists named interfaces with their levels', () => {
    const cli = showCli()
    expect(cli.type('show nameif')).toEqual([
      'Interface                Name                     Security',
      'GigabitEthernet0/0       outside                    0',
      'GigabitEthernet0/1       inside                   100',
      'GigabitEthernet0/2       dmz                       50',
    ])
  })

  it('show conn: lower level first, idle, bytes and flags; expired rows hidden', () => {
    const cli = showCli()
    cli.withTables([WEB_FROM_INSIDE, DNS, INBOUND_WEB, EXPIRED])
    expect(cli.type('show conn')).toEqual([
      '3 in use',
      'TCP outside 198.51.100.7:80 inside 10.0.0.5:51234, idle 0:00:00, bytes 1234, flags UIO',
      'UDP outside 198.51.100.53:53 inside 10.0.0.5:53000, idle 0:00:10, bytes 120, flags -',
      'TCP outside 198.51.100.9:40000 dmz 172.16.0.10:80, idle 0:00:01, bytes 60, flags aA',
    ])
    expect(cli.type('show conn count')).toEqual(['3 in use'])
    expect(cli.type('show conn all')).toHaveLength(4)
    expect(cli.type('show conn detail').slice(0, 3)).toEqual([
      '3 in use',
      'TCP outside: 198.51.100.7/80 inside: 10.0.0.5/51234,',
      '    flags UIO, idle 0s, uptime 59s, timeout 1h0m0s, bytes 1234',
    ])
  })

  it('show conn without a running simulation prints an empty table', () => {
    expect(showCli().type('show conn')).toEqual(['0 in use'])
  })

  it('show xlate: static rows from the objects and live PAT rows', () => {
    const cli = showCli()
    cli.withTables([], [PAT_ROW])
    expect(cli.type('show xlate')).toEqual([
      '2 in use',
      'Flags: D - DNS, e - extended, I - identity, i - dynamic, r - portmap,',
      '       s - static, T - twice, N - net-to-net',
      'NAT from dmz:172.16.0.10 to outside:203.0.113.10 flags s idle 0:01:00 timeout 0:00:00',
      'TCP PAT from inside:10.0.0.5/51234 to outside:203.0.113.2/51234 flags ri idle 0:00:05 timeout 0:00:30',
    ])
  })

  it('show interface ip brief and show route reuse the routed views', () => {
    const cli = showCli()
    const brief = cli.type('show interface ip brief')
    expect(brief[0]).toBe('Interface              IP-Address      OK? Method Status                Protocol')
    expect(brief[1]).toMatch(/^GigabitEthernet0\/0\s+203\.0\.113\.2\s+YES manual/)
    expect(cli.type('show route')).toContain('Gateway of last resort is not set')
  })

  it('clear conn and clear xlate are simulator jobs', () => {
    const cli = showCli()
    cli.type('clear conn')
    expect(cli.last.job).toEqual({ kind: 'clearTable', deviceId: 'fw1', table: 'firewallConnections' })
    const other = showCli()
    other.type('clear xlate')
    expect(other.last.job).toEqual({ kind: 'clearTable', deviceId: 'fw1', table: 'natTranslations' })
  })
})

describe('firewall CLI: packet-tracer', () => {
  const ACL = ['configure terminal', 'access-list OUTSIDE_IN extended permit tcp any host 172.16.0.10 eq 80', 'access-group OUTSIDE_IN in interface outside', 'end']

  it('allows inside → outside by the level rule and shows the source translation', () => {
    const cli = showCli()
    expect(cli.type('packet-tracer input inside tcp 10.0.0.5 51234 203.0.113.1 80')).toEqual([
      'Lab explanation of the configuration: no packet is sent.',
      '',
      'Phase: 1',
      'Type: ROUTE-LOOKUP',
      'Result: ALLOW',
      'Info: found directly connected using egress interface outside',
      '',
      'Phase: 2',
      'Type: ACCESS-LIST',
      'Result: ALLOW',
      'Info: implicit rule: level 100 (inside) to level 0 (outside) is allowed',
      '',
      'Phase: 3',
      'Type: NAT',
      'Result: ALLOW',
      'Info: translate 10.0.0.5 to 203.0.113.2 (object LAN, dynamic)',
      '',
      'Phase: 4',
      'Type: CONN-SETTINGS',
      'Result: ALLOW',
      'Info: new TCP connection, idle timeout 1:00:00; replies return through it',
      '',
      'Result:',
      'input-interface: inside',
      'output-interface: outside',
      'Action: allow',
    ])
  })

  it('drops outside → dmz without an access-group, allows it with the ACL (real address after un-NAT)', () => {
    const cli = showCli()
    const denied = cli.type('packet-tracer input outside tcp 198.51.100.9 40000 203.0.113.10 80')
    expect(denied.slice(-4)).toEqual([
      'input-interface: outside',
      'output-interface: dmz',
      'Action: drop',
      'Drop-reason: no access-group in on outside: traffic from level 0 to higher level 50 needs an access list',
    ])
    cli.typeAll(...ACL)
    const allowed = cli.type('packet-tracer input outside tcp 198.51.100.9 40000 203.0.113.10 80')
    expect(allowed).toContain('Info: access-list OUTSIDE_IN (in) line 10 permit: permit tcp any host 172.16.0.10 eq www')
    expect(allowed).toContain('Info: untranslate 203.0.113.10 to 172.16.0.10')
    expect(allowed.at(-1)).toBe('Action: allow')
    const port = cli.type('packet-tracer input outside tcp 198.51.100.9 40000 203.0.113.10 443')
    expect(port.at(-1)).toBe('Drop-reason: access-list OUTSIDE_IN (in): implicit deny')
  })

  it('same-level traffic needs same-security-traffic; no route drops; unknown nameif is an error', () => {
    const cli = showCli()
    cli.typeAll('configure terminal', 'interface g0/2', 'security-level 100', 'end')
    expect(cli.type('packet-tracer input inside icmp 10.0.0.5 8 0 172.16.0.10').at(-1)).toBe(
      'Drop-reason: same security level 100 on inside and dmz; same-security-traffic permit inter-interface is not configured',
    )
    cli.typeAll('configure terminal', 'same-security-traffic permit inter-interface', 'end')
    const echo = cli.type('packet-tracer input inside icmp 10.0.0.5 8 0 172.16.0.10')
    expect(echo).toContain('Info: ICMP echo tracked (inspect icmp), idle timeout 0:00:02; replies return')
    expect(echo.at(-1)).toBe('Action: allow')
    expect(cli.type('packet-tracer input inside udp 10.0.0.5 5000 192.0.2.1 53').at(-1)).toBe('Drop-reason: no route to host 192.0.2.1')
    expect(cli.type('packet-tracer input wan udp 10.0.0.5 5000 192.0.2.1 53')).toEqual(['% Interface name "wan" not found'])
  })

  it('is a privileged command', () => {
    const cli = new FirewallCli()
    expect(cli.type('packet-tracer input inside tcp 10.0.0.5 1 10.0.0.6 2').at(-2)).toBe("% Invalid input detected at '^' marker.")
  })
})
