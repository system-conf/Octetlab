// Parses one ACL entry written as text ("permit tcp any host 10.0.0.5 eq www", "remark Staff"), the same
// grammar as the CLI rule tree (aclRuleTree.ts) without sequence numbers. Used by the GUI card, where a
// list is edited as lines of text. Problems are codes the UI translates (acl:section.problems.*).
import type { AccessListType, AclAction, AclAddressMatch, AclPortMatch, ExtendedAclRule } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { AclEntryDraft } from './AclEdits'
import { ANY, AclSyntax, ICMP_NAMES, type TransportProtocol } from './AclSyntax'

export type AclRuleProblem = 'action' | 'address' | 'protocol' | 'port' | 'extra' | 'remark'

export type AclRuleParse = { readonly ok: true; readonly draft: AclEntryDraft } | { readonly ok: false; readonly problem: AclRuleProblem; readonly text?: string }

const MAX_REMARK = 100
const PORT_OPS = ['eq', 'neq', 'gt', 'lt'] as const

class ParseFailure extends Error {
  readonly problem: AclRuleProblem

  constructor(problem: AclRuleProblem) {
    super(`ACL rule: ${problem}`)
    this.problem = problem
  }
}

/** A cursor over the words of one line. */
class Words {
  private readonly words: readonly string[]
  private index = 0

  constructor(words: readonly string[]) {
    this.words = words
  }

  peek(): string | undefined {
    return this.words[this.index]?.toLowerCase()
  }

  next(problem: AclRuleProblem): string {
    const word = this.words[this.index]
    if (word === undefined) throw new ParseFailure(problem)
    this.index += 1
    return word.toLowerCase()
  }

  take(word: string): boolean {
    if (this.peek() !== word) return false
    this.index += 1
    return true
  }

  rest(): string {
    return this.words.slice(this.index).join(' ')
  }
}

function ipv4(words: Words): string {
  const word = words.next('address')
  const value = Ipv4.parse(word)
  if (value === null) throw new ParseFailure('address')
  return Ipv4.format(value)
}

function address(words: Words, wildcardOptional: boolean): AclAddressMatch {
  if (words.take('any')) return ANY
  if (words.take('host')) return { address: ipv4(words), wildcard: '0.0.0.0' }
  const base = ipv4(words)
  const following = words.peek()
  if (following !== undefined && Ipv4.parse(following) !== null) return AclSyntax.masked(base, ipv4(words))
  if (!wildcardOptional) throw new ParseFailure('address')
  return { address: base, wildcard: '0.0.0.0' }
}

function port(words: Words, protocol: TransportProtocol): AclPortMatch | undefined {
  const parse = (): number => {
    const value = AclSyntax.parsePort(protocol, words.next('port'))
    if (value === null) throw new ParseFailure('port')
    return value
  }
  for (const op of PORT_OPS) if (words.take(op)) return { op, port: parse() }
  if (!words.take('range')) return undefined
  const from = parse()
  const to = parse()
  if (from > to) throw new ParseFailure('port')
  return { op: 'range', from, to }
}

function icmpMatch(words: Words): { icmpType?: number; icmpCode?: number } {
  const word = words.peek()
  if (word === undefined || word === 'log') return {}
  const named = ICMP_NAMES[word]
  if (named !== undefined) {
    words.next('extra')
    return named.code === undefined ? { icmpType: named.type } : { icmpType: named.type, icmpCode: named.code }
  }
  const number = (text: string | undefined): number | null => (text !== undefined && /^\d+$/.test(text) && Number(text) <= 255 ? Number(text) : null)
  const type = number(word)
  if (type === null) return {}
  words.next('extra')
  const code = number(words.peek())
  if (code === null) return { icmpType: type }
  words.next('extra')
  return { icmpType: type, icmpCode: code }
}

function extended(words: Words, action: AclAction): Omit<ExtendedAclRule, 'seq'> {
  const protocol = words.next('protocol')
  if (protocol !== 'ip' && protocol !== 'icmp' && protocol !== 'tcp' && protocol !== 'udp') throw new ParseFailure('protocol')
  const source = address(words, false)
  const transport = protocol === 'tcp' || protocol === 'udp' ? protocol : null
  const sourcePort = transport === null ? undefined : port(words, transport)
  const destination = address(words, false)
  const destinationPort = transport === null ? undefined : port(words, transport)
  const established = protocol === 'tcp' && words.take('established')
  const icmp = protocol === 'icmp' ? icmpMatch(words) : {}
  return {
    kind: 'extended',
    action,
    protocol,
    source,
    destination,
    ...(sourcePort === undefined ? {} : { sourcePort }),
    ...(destinationPort === undefined ? {} : { destinationPort }),
    ...(established ? { established: true } : {}),
    ...icmp,
  }
}

export class AclRuleParser {
  static parse(type: AccessListType, line: string): AclRuleParse {
    const words = new Words(line.trim().split(/\s+/).filter((word) => word !== ''))
    try {
      const word = words.next('action')
      if (word === 'remark') {
        const text = words.rest()
        return text === '' || text.length > MAX_REMARK ? { ok: false, problem: 'remark' } : { ok: true, draft: { kind: 'remark', text } }
      }
      if (word !== 'permit' && word !== 'deny') return { ok: false, problem: 'action' }
      const action: AclAction = word === 'permit' ? 'permit' : 'deny'
      const rule = type === 'standard' ? { kind: 'standard' as const, action, source: address(words, true) } : extended(words, action)
      const log = words.take('log')
      const extra = words.rest()
      if (extra !== '') return { ok: false, problem: 'extra', text: extra }
      return { ok: true, draft: log ? { ...rule, log: true } : rule }
    } catch (error) {
      if (error instanceof ParseFailure) return { ok: false, problem: error.problem }
      throw error
    }
  }
}
