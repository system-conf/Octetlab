// The device-config forms' per-field validation messages (src/features/deviceConfig/model) as English
// lines for the model, e.g. "dhcp.pools[0].network: Enter a valid IPv4 address, e.g. 192.168.1.10."
import type { LocalizedMessage } from '../../../src/domain/Messages'
import { ToolError } from '../errors/ToolError'
import type { EnglishMessages } from '../text/EnglishMessages'

type Fields = Partial<Record<string, LocalizedMessage>>

export class FieldProblems {
  private readonly messages: EnglishMessages

  constructor(messages: EnglishMessages) {
    this.messages = messages
  }

  /** One line per failing field of `fields`, each prefixed with `path` ("dhcp.pools[0]"). */
  fields(path: string, fields: Fields): string[] {
    return Object.entries(fields).flatMap(([field, message]) => (message === undefined ? [] : [`${path}.${field}: ${this.messages.render(message)}`]))
  }

  /** The lines of every row of a row editor (`path[index].field: …`). */
  rows(path: string, rows: readonly Fields[]): string[] {
    return rows.flatMap((row, index) => this.fields(`${path}[${index}]`, row))
  }

  /** A line for one message, or none. */
  one(path: string, message: LocalizedMessage | undefined): string[] {
    return message === undefined ? [] : [`${path}: ${this.messages.render(message)}`]
  }

  /** A validation ToolError listing `problems` when there are any. */
  check(what: string, problems: readonly string[]): void {
    if (problems.length === 0) return
    throw ToolError.validation(`${what} was not changed: ${problems.join(' ')}`)
  }
}
