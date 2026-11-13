// EXEC commands of the firewall (docs/FIREWALL_PACK.md §6.2):
//   show nameif · show conn [all | count | detail] · show xlate · show route · show interface ip brief
//   clear conn · clear xlate (simulator jobs: only the simulator writes the runtime)
//   packet-tracer input <nameif> tcp|udp <src> <sport> <dst> <dport>
//   packet-tracer input <nameif> icmp <src> <type> <code> <dst>
// `show access-list` is the ACL set's `show access-lists` (prefix match); `show interface ip brief` reuses the
// router's brief view (same column layout on the appliance).
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError, cliText } from '../core/CliOutput'
import { InterfaceBriefView } from '../router/InterfaceBriefView'
import { RouteTableView } from '../router/RouteTableView'
import { ConnTableView, type ConnFormat } from './ConnTableView'
import { FirewallDecision, type TracedPacket } from './FirewallDecision'
import { NameifView } from './NameifView'
import { PacketTracerView } from './PacketTracerView'
import { XlateView } from './XlateView'
import { FIREWALL_ERRORS, isFirewall } from './firewallMessages'

const MAX_PORT = 65535
const MAX_ICMP = 255

function showConn(ctx: CliContext, format: ConnFormat): CliCommandResult {
  return { lines: cliText(...ConnTableView.lines(ctx.device, ctx.env.runtime, ctx.env.now, format)) }
}

function clearTable(ctx: CliContext, table: 'firewallConnections' | 'natTranslations'): CliCommandResult {
  return { job: { request: { kind: 'clearTable', deviceId: ctx.device.id, table }, onDone: () => ({}) } }
}

function trace(ctx: CliContext): CliCommandResult {
  const protocol = ctx.path.includes('tcp') ? 'tcp' : ctx.path.includes('udp') ? 'udp' : 'icmp'
  const base = { src: ctx.args.text('src'), dst: ctx.args.text('dst') }
  const packet: TracedPacket =
    protocol === 'icmp'
      ? { protocol, ...base, icmpType: ctx.args.number('icmpType'), icmpCode: ctx.args.number('icmpCode') }
      : { protocol, ...base, srcPort: ctx.args.number('srcPort'), dstPort: ctx.args.number('dstPort') }
  const nameif = ctx.args.text('nameif')
  const result = FirewallDecision.explain(ctx.device, nameif, packet)
  return result === null ? { lines: cliError(FIREWALL_ERRORS.unknownNameif(nameif)) } : { lines: cliText(...PacketTracerView.lines(result)) }
}

function transport(word: 'tcp' | 'udp', help: string): CliNode {
  const port = (name: string, label: string, children: readonly CliNode[], end: boolean): CliNode =>
    param(name, { type: 'number', min: 0, max: MAX_PORT }, label, end ? { run: trace } : { children })
  return keyword(word, help, {
    children: [
      param('src', { type: 'ipv4' }, 'Source IP address', {
        children: [port('srcPort', 'Source port', [param('dst', { type: 'ipv4' }, 'Destination IP address', { children: [port('dstPort', 'Destination port', [], true)] })], false)],
      }),
    ],
  })
}

const icmpNode = keyword('icmp', 'Internet Control Message Protocol', {
  children: [
    param('src', { type: 'ipv4' }, 'Source IP address', {
      children: [
        param('icmpType', { type: 'number', min: 0, max: MAX_ICMP }, 'ICMP type (8 = echo request)', {
          children: [param('icmpCode', { type: 'number', min: 0, max: MAX_ICMP }, 'ICMP code', { children: [param('dst', { type: 'ipv4' }, 'Destination IP address', { run: trace })] })],
        }),
      ],
    }),
  ],
})

const packetTracer = keyword('packet-tracer', 'Explain how the configuration treats a packet', {
  when: isFirewall,
  children: [
    keyword('input', 'Interface the packet arrives on', {
      children: [param('nameif', { type: 'word', label: 'WORD' }, 'Name of interface (nameif)', { children: [icmpNode, transport('tcp', 'Transmission Control Protocol'), transport('udp', 'User Datagram Protocol')] })],
    }),
  ],
})

const showNode = keyword('show', 'Show running system information', {
  children: [
    keyword('conn', 'Connections', {
      when: isFirewall,
      run: (ctx) => showConn(ctx, 'brief'),
      children: [
        keyword('all', 'All connections', { run: (ctx) => showConn(ctx, 'brief') }),
        keyword('count', 'Number of connections in use', { run: (ctx) => showConn(ctx, 'count') }),
        keyword('detail', 'Connections with details', { run: (ctx) => showConn(ctx, 'detail') }),
      ],
    }),
    keyword('interfaces', 'Interface status and configuration', {
      children: [
        keyword('ip', 'IP address information', {
          when: isFirewall,
          children: [keyword('brief', 'Brief summary of IP status', { run: (ctx) => ({ lines: cliText(...InterfaceBriefView.lines(ctx.env.network, ctx.device)) }) })],
        }),
      ],
    }),
    keyword('nameif', 'Interface names and security levels', { when: isFirewall, run: (ctx) => ({ lines: cliText(...NameifView.lines(ctx.device)) }) }),
    keyword('route', 'Routing table', { when: isFirewall, run: (ctx) => ({ lines: cliText(...RouteTableView.lines(ctx.device, ctx.env.runtime?.network.routes ?? [])) }) }),
    keyword('xlate', 'Address translations', { when: isFirewall, run: (ctx) => ({ lines: cliText(...XlateView.lines(ctx.device, ctx.env.runtime, ctx.env.now)) }) }),
  ],
})

const clearNode = keyword('clear', 'Reset functions', {
  children: [
    keyword('conn', 'Remove every tracked connection', { when: isFirewall, run: (ctx) => clearTable(ctx, 'firewallConnections') }),
    keyword('xlate', 'Remove the dynamic address translations', { when: isFirewall, run: (ctx) => clearTable(ctx, 'natTranslations') }),
  ],
})

export const firewallExecCommands: readonly CliCommandRegistration[] = [
  { modes: EXEC_MODE_KINDS, node: showNode },
  { modes: ['privilegedExec'], node: clearNode },
  { modes: ['privilegedExec'], node: packetTracer },
]
