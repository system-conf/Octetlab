// Command trees of one ACL rule (pack 5.2, docs/SECURITY_PACK.md §7), shared by `access-list <n> …` and the
// `(config-std-nacl)` / `(config-ext-nacl)` sub-modes. IOS forms (Cisco "Configuring Commonly Used IP ACLs",
// https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html):
//   standard:  permit|deny  any | host A | A [wildcard]  [log]
//   extended:  permit|deny  ip|icmp|tcp|udp  <src> [port] <dst> [port] [established] [icmp-type [code]] [log]
// Every node that may end a rule runs the same reader, which rebuilds the rule from the args and keywords.
import type { AclAction, AclAddressMatch, AclPortMatch, AclProtocol } from '../../domain'
import type { CliCommandResult, CliContext, CliHandler, CliKeywordNode, CliNode } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import type { AclEntryDraft } from './AclEdits'
import { ANY, AclSyntax, ICMP_NAMES, type TransportProtocol } from './AclSyntax'

/** Where a parsed rule goes: the list of the command (`access-list 10`) or of the sub-mode. */
export interface AclRuleSink {
  add(ctx: CliContext, draft: AclEntryDraft): CliCommandResult
  remove(ctx: CliContext, draft: AclEntryDraft): CliCommandResult
}

type Side = 'src' | 'dst'
type DraftResult = { readonly ok: true; readonly draft: AclEntryDraft } | { readonly ok: false; readonly error: string }
type Reader = (ctx: CliContext) => DraftResult

interface Handlers {
  readonly run: CliHandler
  readonly runNo: CliHandler
}

const LOG_HELP = 'Log matches against this entry'
const PORT_LABEL = '<0-65535>'
const PORT_OPS = [
  ['eq', 'Eq', 'Match only packets on a given port number'],
  ['gt', 'Gt', 'Match only packets with a greater port number'],
  ['lt', 'Lt', 'Match only packets with a lower port number'],
  ['neq', 'Neq', 'Match only packets not on a given port number'],
] as const
const SIDE_HELP: Readonly<Record<Side, { readonly address: string; readonly any: string; readonly host: string; readonly wildcard: string }>> = {
  src: { address: 'Source address', any: 'Any source host', host: 'A single source host', wildcard: 'Source wildcard bits' },
  dst: { address: 'Destination address', any: 'Any destination host', host: 'A single destination host', wildcard: 'Destination wildcard bits' },
}

function handlers(sink: AclRuleSink, read: Reader): Handlers {
  const apply = (ctx: CliContext, target: (draft: AclEntryDraft) => CliCommandResult): CliCommandResult => {
    const result = read(ctx)
    return result.ok ? target(result.draft) : { lines: cliError(result.error) }
  }
  return { run: (ctx) => apply(ctx, (draft) => sink.add(ctx, draft)), runNo: (ctx) => apply(ctx, (draft) => sink.remove(ctx, draft)) }
}

function addressOf(ctx: CliContext, side: Side): AclAddressMatch {
  const { args } = ctx
  if (args.has(`${side}Host`)) return { address: args.text(`${side}Host`), wildcard: '0.0.0.0' }
  if (args.has(`${side}Address`)) {
    const address = args.text(`${side}Address`)
    return args.has(`${side}Wildcard`) ? AclSyntax.masked(address, args.text(`${side}Wildcard`)) : { address, wildcard: '0.0.0.0' }
  }
  return ANY
}

type PortResult = { readonly ok: true; readonly match?: AclPortMatch } | { readonly ok: false; readonly error: string }

function portOf(ctx: CliContext, side: Side, protocol: TransportProtocol): PortResult {
  const parse = (name: string): number | null => AclSyntax.parsePort(protocol, ctx.args.text(name))
  const invalid = (name: string): PortResult => ({ ok: false, error: `% Unknown port name or number: ${ctx.args.text(name)}` })
  for (const [op, suffix] of PORT_OPS) {
    const name = `${side}${suffix}`
    if (!ctx.args.has(name)) continue
    const port = parse(name)
    return port === null ? invalid(name) : { ok: true, match: { op, port } }
  }
  if (!ctx.args.has(`${side}RangeLow`)) return { ok: true }
  const from = parse(`${side}RangeLow`)
  const to = parse(`${side}RangeHigh`)
  if (from === null) return invalid(`${side}RangeLow`)
  if (to === null) return invalid(`${side}RangeHigh`)
  return from <= to ? { ok: true, match: { op: 'range', from, to } } : { ok: false, error: '% Invalid port range' }
}

function logged(ctx: CliContext): { log?: true } {
  return ctx.path.includes('log') ? { log: true } : {}
}

function standardReader(action: AclAction): Reader {
  return (ctx) => ({ ok: true, draft: { kind: 'standard', action, source: addressOf(ctx, 'src'), ...logged(ctx) } })
}

function extendedReader(action: AclAction, protocol: AclProtocol, icmp?: { readonly type: number; readonly code?: number }): Reader {
  return (ctx) => {
    const base = { kind: 'extended' as const, action, protocol, source: addressOf(ctx, 'src'), destination: addressOf(ctx, 'dst') }
    if (protocol === 'tcp' || protocol === 'udp') {
      const sourcePort = portOf(ctx, 'src', protocol)
      if (!sourcePort.ok) return sourcePort
      const destinationPort = portOf(ctx, 'dst', protocol)
      if (!destinationPort.ok) return destinationPort
      const established = protocol === 'tcp' && ctx.path.includes('established') ? { established: true } : {}
      const ports = { ...(sourcePort.match ? { sourcePort: sourcePort.match } : {}), ...(destinationPort.match ? { destinationPort: destinationPort.match } : {}) }
      return { ok: true, draft: { ...base, ...ports, ...established, ...logged(ctx) } }
    }
    if (protocol === 'icmp') {
      const type = icmp?.type ?? (ctx.args.has('icmpType') ? ctx.args.number('icmpType') : undefined)
      const code = icmp === undefined ? (ctx.args.has('icmpCode') ? ctx.args.number('icmpCode') : undefined) : icmp.code
      return { ok: true, draft: { ...base, ...(type === undefined ? {} : { icmpType: type }), ...(code === undefined ? {} : { icmpCode: code }), ...logged(ctx) } }
    }
    return { ok: true, draft: { ...base, ...logged(ctx) } }
  }
}

function logNode(ends: Handlers): CliKeywordNode {
  return keyword('log', LOG_HELP, ends)
}

/** any | host A | A W, each continuing with `children`; `ends` when the rule may stop after the address. */
function addressNodes(side: Side, children: readonly CliNode[], ends: Handlers | null, wildcardOptional = false): CliNode[] {
  const help = SIDE_HELP[side]
  const end = ends ?? {}
  return [
    keyword('any', help.any, { ...end, children }),
    keyword('host', help.host, { children: [param(`${side}Host`, { type: 'ipv4' }, help.address, { ...end, children })] }),
    param(`${side}Address`, { type: 'ipv4' }, help.address, {
      ...(wildcardOptional ? end : {}),
      children: [param(`${side}Wildcard`, { type: 'ipv4' }, help.wildcard, { ...end, children }), ...(wildcardOptional ? children : [])],
    }),
  ]
}

function portNodes(side: Side, children: readonly CliNode[], ends: Handlers | null): CliKeywordNode[] {
  const end = ends ?? {}
  const port = (name: string, help: string, next: readonly CliNode[], withEnd: boolean) =>
    param(name, { type: 'word', label: PORT_LABEL }, help, { ...(withEnd ? end : {}), children: next })
  return [
    ...PORT_OPS.map(([op, suffix, help]) => keyword(op, help, { children: [port(`${side}${suffix}`, 'Port number', children, true)] })),
    keyword('range', 'Match only packets in the range of port numbers', {
      children: [port(`${side}RangeLow`, 'Port number', [port(`${side}RangeHigh`, 'Port number', children, true)], false)],
    }),
  ]
}

function transportNodes(sink: AclRuleSink, action: AclAction, protocol: TransportProtocol): CliNode[] {
  const ends = handlers(sink, extendedReader(action, protocol))
  const options: CliNode[] = protocol === 'tcp' ? [keyword('established', 'Match established connections', { ...ends, children: [logNode(ends)] }), logNode(ends)] : [logNode(ends)]
  const destination = addressNodes('dst', [...portNodes('dst', options, ends), ...options], ends)
  return addressNodes('src', [...portNodes('src', destination, null), ...destination], null)
}

function icmpNodes(sink: AclRuleSink, action: AclAction): CliNode[] {
  const ends = handlers(sink, extendedReader(action, 'icmp'))
  const named = Object.entries(ICMP_NAMES).map(([name, icmp]) => {
    const own = handlers(sink, extendedReader(action, 'icmp', icmp))
    return keyword(name, icmp.help, { ...own, children: [logNode(own)] })
  })
  const typeNode = param('icmpType', { type: 'number', min: 0, max: 255 }, 'ICMP message type', {
    ...ends,
    children: [param('icmpCode', { type: 'number', min: 0, max: 255 }, 'ICMP message code', { ...ends, children: [logNode(ends)] }), logNode(ends)],
  })
  const destination = addressNodes('dst', [typeNode, ...named, logNode(ends)], ends)
  return addressNodes('src', destination, null)
}

export class AclRuleTree {
  /** What follows `permit` / `deny` in a standard list. */
  static standard(sink: AclRuleSink, action: AclAction): CliNode[] {
    const ends = handlers(sink, standardReader(action))
    return addressNodes('src', [logNode(ends)], ends, true)
  }

  /** What follows `permit` / `deny` in an extended list: the protocol and the rest. */
  static extended(sink: AclRuleSink, action: AclAction): CliNode[] {
    const ipEnds = handlers(sink, extendedReader(action, 'ip'))
    return [
      keyword('icmp', 'Internet Control Message Protocol', { children: icmpNodes(sink, action) }),
      keyword('ip', 'Any Internet Protocol', { children: addressNodes('src', addressNodes('dst', [logNode(ipEnds)], ipEnds), null) }),
      keyword('tcp', 'Transmission Control Protocol', { children: transportNodes(sink, action, 'tcp') }),
      keyword('udp', 'User Datagram Protocol', { children: transportNodes(sink, action, 'udp') }),
    ]
  }

  /** `permit …` / `deny …` keywords of a list type. */
  static actions(sink: AclRuleSink, type: 'standard' | 'extended'): CliKeywordNode[] {
    const tree = type === 'standard' ? AclRuleTree.standard : AclRuleTree.extended
    return [
      keyword('deny', 'Specify packets to reject', { children: tree(sink, 'deny') }),
      keyword('permit', 'Specify packets to forward', { children: tree(sink, 'permit') }),
    ]
  }
}
