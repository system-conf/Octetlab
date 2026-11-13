// `?` help and Tab completion (docs/CLI.md §3.4), IOS format.
import type { Device } from '../../domain'
import type { CliKeywordNode, CliMode, CliModeKind, CliNode } from '../contract'
import { CliErrors } from './CliErrors'
import { CliParamMatcher, paramLabel } from './CliParamMatcher'
import type { CliParser, WalkState } from './CliParser'
import { type CliToken, CliTokenizer } from './CliTokenizer'
import { InterfaceNames } from './InterfaceNames'

/** Header of the top-level `?` list per mode. */
const MODE_HELP_HEADERS: Readonly<Record<CliModeKind, string>> = {
  userExec: 'Exec commands:',
  privilegedExec: 'Exec commands:',
  globalConfig: 'Configure commands:',
  interface: 'Interface configuration commands:',
  subInterface: 'Interface configuration commands:',
  interfaceRange: 'Interface configuration commands:',
  line: 'Line configuration commands:',
  vlan: 'VLAN configuration commands:',
  dhcpPool: 'DHCP pool configuration commands:',
  router: 'Router configuration commands:',
  accessList: 'Access list configuration commands:',
  objectNetwork: 'Network object configuration commands:',
}

type HelpEntry = readonly [name: string, help: string]

function formatEntries(entries: readonly HelpEntry[]): string[] {
  const width = Math.max(0, ...entries.map(([name]) => name.length))
  return entries.map(([name, help]) => `  ${name.padEnd(width)}  ${help}`.trimEnd())
}

function byWord(a: CliKeywordNode, b: CliKeywordNode): number {
  return a.word.toLowerCase().localeCompare(b.word.toLowerCase())
}

export interface HelpOutput {
  readonly lines: readonly string[]
  /** An IOS error (with caret) instead of a list. */
  readonly error: boolean
}

export class CliHelp {
  private readonly parser: CliParser

  constructor(parser: CliParser) {
    this.parser = parser
  }

  /** Output of `<input>?` typed after `promptLength` characters of prompt. */
  help(input: string, mode: CliMode, device: Device, promptLength: number): HelpOutput {
    const tokens = CliTokenizer.tokenize(input)
    const listNext = CliTokenizer.endsWithSpace(input)
    const count = listNext ? tokens.length : tokens.length - 1
    const walked = this.parser.walk(input, tokens, count, mode.kind, device)
    if (walked.kind === 'ambiguous') return { lines: CliErrors.ambiguous(input), error: true }
    if (walked.kind === 'invalid') return { lines: CliErrors.invalid(promptLength + walked.at), error: true }
    if (walked.kind === 'incomplete') {
      const typed = InterfaceNames.matchType(tokens[count - 1]?.text ?? '', InterfaceNames.typesOf(device))
      const name = typed.ok ? typed.type.name : 'Interface'
      return { lines: formatEntries([['<0-9>', `${name} interface number`]]), error: false }
    }
    const { state } = walked
    if (listNext) {
      const header = tokens.length === 0 ? [MODE_HELP_HEADERS[mode.kind]] : []
      return { lines: [...header, ...formatEntries(this.nextEntries(state, device))], error: false }
    }
    const words = this.completions(state, input, tokens, device)
    return words.length === 0 ? { lines: ['% Unrecognized command'], error: true } : { lines: [`${words.join('  ')}  `], error: false }
  }

  /** Tab: the input with its last word completed (plus a space after a keyword); unchanged when not unique. */
  complete(input: string, mode: CliMode, device: Device): string {
    if (CliTokenizer.endsWithSpace(input)) return input
    const tokens = CliTokenizer.tokenize(input)
    const last = tokens[tokens.length - 1]
    if (last === undefined) return input
    const walked = this.parser.walk(input, tokens, tokens.length - 1, mode.kind, device)
    if (walked.kind !== 'ok') return input
    const keywords = this.keywordsStarting(walked.state.level, last.text)
    const exact = keywords.find((node) => node.word.toLowerCase() === last.text.toLowerCase())
    const only = exact ?? (keywords.length === 1 ? keywords[0] : undefined)
    const head = input.slice(0, last.start)
    if (only !== undefined) return `${head}${only.word} `
    if (keywords.length > 0 || !this.hasInterfaceParam(walked.state.level) || !/^[A-Za-z-]+$/.test(last.text)) return input
    const type = InterfaceNames.matchType(last.text, InterfaceNames.typesOf(device))
    return type.ok ? `${head}${type.type.name}` : input
  }

  private nextEntries(state: WalkState, device: Device): HelpEntry[] {
    const params: HelpEntry[] = []
    const keywords: CliKeywordNode[] = []
    for (const node of state.level) {
      if (node.hidden === true) continue
      if (node.kind === 'keyword') keywords.push(node)
      else if (this.isInterfaceParam(node)) {
        // `interface ?` lists the device's interface types.
        params.push(...InterfaceNames.typesOf(device).map((type): HelpEntry => [type.name, type.help]))
      } else params.push([paramLabel(node.param), node.help])
    }
    const entries: HelpEntry[] = [...params, ...keywords.sort(byWord).map((node): HelpEntry => [node.word, node.help])]
    if (this.parser.handlerOf(state) !== undefined) entries.push(['<cr>', ''])
    return entries
  }

  /** `word?`: keywords and interface types starting with the word, and parameters that accept it. */
  private completions(state: WalkState, input: string, tokens: readonly CliToken[], device: Device): string[] {
    const index = tokens.length - 1
    const partial = tokens[index]?.text ?? ''
    const words = this.keywordsStarting(state.level, partial)
      .filter((node) => node.hidden !== true)
      .sort(byWord)
      .map((node) => node.word)
    for (const node of state.level) {
      if (node.kind !== 'param' || node.hidden === true) continue
      if (this.isInterfaceParam(node) && /^[A-Za-z-]+$/.test(partial)) {
        const lower = partial.toLowerCase()
        words.push(...InterfaceNames.typesOf(device).filter((type) => type.name.toLowerCase().startsWith(lower)).map((type) => type.name))
        continue
      }
      const match = CliParamMatcher.match(node.param, input, tokens, index, device)
      if (match.kind === 'ok' || match.kind === 'incomplete') words.push(paramLabel(node.param))
    }
    return words
  }

  private isInterfaceParam(node: CliNode): boolean {
    return node.kind === 'param' && (node.param.type === 'interface' || node.param.type === 'interfaceRange')
  }

  private keywordsStarting(level: readonly CliNode[], partial: string): CliKeywordNode[] {
    const lower = partial.toLowerCase()
    return level.filter((node): node is CliKeywordNode => node.kind === 'keyword' && node.word.toLowerCase().startsWith(lower))
  }

  private hasInterfaceParam(level: readonly CliNode[]): boolean {
    return level.some((node) => this.isInterfaceParam(node))
  }
}
