// Renders Octetlab's LocalizedMessage values (engine, CLI, lab parser, simulator) as English text, so
// the model gets real sentences. Follows the subset of i18next the app's en locale uses: dotted keys,
// `{{name}}` / `{{name, number}}` interpolation and `_one` / `_other` plurals selected by `count`.
import type { LocalizedMessage } from '../../../src/domain/Messages'
import type { TerminalLine } from '../../../src/domain'
import catalog from '../../../src/locales/en/catalog.json'
import cli from '../../../src/locales/en/cli.json'
import engine from '../../../src/locales/en/engine.json'
import hostCli from '../../../src/locales/en/hostCli.json'
import lab from '../../../src/locales/en/lab.json'
import samples from '../../../src/locales/en/samples.json'
import simulation from '../../../src/locales/en/simulation.json'
import workspace from '../../../src/locales/en/workspace.json'

/** Namespaces a message of the Worker's code paths can come from. */
const NAMESPACES: Readonly<Record<string, unknown>> = { catalog, cli, engine, hostCli, lab, samples, simulation, workspace }

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*(?:,\s*([A-Za-z]+)\s*)?\}\}/g
const englishPlurals = new Intl.PluralRules('en')
const englishNumbers = new Intl.NumberFormat('en')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class EnglishMessages {
  /** The English text of `key` ('namespace:path.to.key'), or null when the locale has no such string. */
  text(key: string, params: Record<string, string | number> = {}): string | null {
    const separator = key.indexOf(':')
    if (separator === -1) return null
    const root = NAMESPACES[key.slice(0, separator)]
    const path = key.slice(separator + 1).split('.')
    const leaf = path.pop()
    if (leaf === undefined || root === undefined) return null
    let node: unknown = root
    for (const segment of path) {
      if (!isRecord(node)) return null
      node = node[segment]
    }
    if (!isRecord(node)) return null
    const template = this.pick(node, leaf, params.count)
    return template === null ? null : this.interpolate(template, params)
  }

  /** The message's English text; an unknown key falls back to the key itself (like i18next) and is logged. */
  render(message: LocalizedMessage): string {
    const text = this.text(message.key, message.params)
    if (text !== null) return text
    console.error(`EnglishMessages: no English text for '${message.key}'`)
    return message.params === undefined ? message.key : `${message.key} ${JSON.stringify(message.params)}`
  }

  /** A string list key (e.g. sample topics); [] when absent. */
  list(key: string): string[] {
    const separator = key.indexOf(':')
    if (separator === -1) return []
    let node: unknown = NAMESPACES[key.slice(0, separator)]
    for (const segment of key.slice(separator + 1).split('.')) {
      if (!isRecord(node)) return []
      node = node[segment]
    }
    return Array.isArray(node) ? node.filter((item): item is string => typeof item === 'string') : []
  }

  /** One terminal line as text (device output verbatim, app messages rendered). */
  line(line: TerminalLine): string {
    return line.message === undefined ? line.text : this.render(line.message)
  }

  lines(lines: readonly TerminalLine[]): string[] {
    return lines.map((line) => this.line(line))
  }

  private pick(node: Record<string, unknown>, leaf: string, count: string | number | undefined): string | null {
    if (typeof count === 'number') {
      const plural = node[`${leaf}_${englishPlurals.select(count)}`]
      if (typeof plural === 'string') return plural
    }
    const plain = node[leaf]
    return typeof plain === 'string' ? plain : null
  }

  private interpolate(template: string, params: Record<string, string | number>): string {
    return template.replace(PLACEHOLDER, (whole, name: string, format: string | undefined) => {
      const value = params[name]
      if (value === undefined) return whole
      return format === 'number' && typeof value === 'number' ? englishNumbers.format(value) : String(value)
    })
  }
}

/** Shared instance (stateless). */
export const englishMessages = new EnglishMessages()
