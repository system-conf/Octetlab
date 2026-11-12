// Live labs (docs/LIVE_LABS.md §5, §6): the messages of the MCP Worker, validated at the boundary.
// Everything from the network is `unknown` until a schema accepted it; fields are mapped one by one.
import { z } from 'zod'
import { LAB_LIMITS, MAX_LAB_TEXT_SIZE } from '../lab'

/** `run_command` output shown in the activity feed (at most 200 lines). */
export interface LiveCommandOutput {
  deviceId: string
  command: string
  lines: readonly string[]
}

/** One assistant action (§5). Summaries are English user content (not translated). */
export interface LiveEvent {
  /** Document version after the change (or the current version for a note). */
  version: number
  /** ISO time. */
  at: string
  actor: 'assistant'
  /** MCP tool name, e.g. 'add_device', 'run_command', 'build_lab'. */
  tool: string
  summary: string
  deviceIds: readonly string[]
  linkIds: readonly string[]
  output?: LiveCommandOutput
}

/** A lab document as the server sends it: compact LabSerializer text, not parsed yet. */
export interface LiveDocumentText {
  version: number
  docText: string
}

export type LiveServerMessage =
  | ({ type: 'snapshot'; events: LiveEvent[] } & LiveDocumentText)
  | ({ type: 'update'; event: LiveEvent | null } & LiveDocumentText)
  | { type: 'event'; event: LiveEvent }
  | { type: 'expired' }
  | { type: 'pong' }

/** `GET /live/<labId>` body. */
export interface LiveCatchUp extends LiveDocumentText {
  events: LiveEvent[]
}

export const MAX_OUTPUT_LINES = 200
const MAX_LINE_LENGTH = 1000
const MAX_EVENTS = 200

const idList = z.array(z.string().max(LAB_LIMITS.idLength)).max(LAB_LIMITS.links)

const eventSchema = z.object({
  version: z.number().int().nonnegative(),
  at: z.string().max(64),
  actor: z.literal('assistant'),
  tool: z.string().max(LAB_LIMITS.nameLength),
  summary: z.string().max(LAB_LIMITS.textLength),
  deviceIds: idList,
  linkIds: idList,
  output: z
    .object({
      deviceId: z.string().max(LAB_LIMITS.idLength),
      command: z.string().max(LAB_LIMITS.textLength),
      lines: z.array(z.string()).max(MAX_OUTPUT_LINES * 5),
    })
    .optional(),
})

const documentFields = {
  version: z.number().int().positive(),
  doc: z.string().max(MAX_LAB_TEXT_SIZE),
}

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), ...documentFields, events: z.array(z.unknown()).max(MAX_EVENTS) }),
  z.object({ type: z.literal('update'), ...documentFields, event: z.unknown() }),
  z.object({ type: z.literal('event'), event: z.unknown() }),
  z.object({ type: z.literal('expired') }),
  z.object({ type: z.literal('pong') }),
])

const catchUpSchema = z.object({ ...documentFields, events: z.array(z.unknown()).max(MAX_EVENTS) })

export type ProtocolResult<Value> = { ok: true; value: Value } | { ok: false; reason: string }

/** Parses the MCP Worker's live messages; never throws for bad input. */
export class LiveLabProtocol {
  /** A WebSocket text frame. */
  static parseMessage(text: string): ProtocolResult<LiveServerMessage> {
    const json = LiveLabProtocol.json(text)
    if (!json.ok) return json
    const parsed = messageSchema.safeParse(json.value)
    if (!parsed.success) return { ok: false, reason: `Unexpected live message: ${parsed.error.issues[0]?.message ?? 'invalid'}` }
    const message = parsed.data
    switch (message.type) {
      case 'snapshot':
        return { ok: true, value: { type: 'snapshot', version: message.version, docText: message.doc, events: LiveLabProtocol.events(message.events) } }
      case 'update':
        return { ok: true, value: { type: 'update', version: message.version, docText: message.doc, event: LiveLabProtocol.event(message.event) } }
      case 'event': {
        const event = LiveLabProtocol.event(message.event)
        return event === null ? { ok: false, reason: 'Live event without a valid event' } : { ok: true, value: { type: 'event', event } }
      }
      case 'expired':
        return { ok: true, value: { type: 'expired' } }
      case 'pong':
        return { ok: true, value: { type: 'pong' } }
    }
  }

  /** The `GET /live/<labId>` JSON body. */
  static parseCatchUp(json: unknown): ProtocolResult<LiveCatchUp> {
    const parsed = catchUpSchema.safeParse(json)
    if (!parsed.success) return { ok: false, reason: `Unexpected live lab response: ${parsed.error.issues[0]?.message ?? 'invalid'}` }
    return { ok: true, value: { version: parsed.data.version, docText: parsed.data.doc, events: LiveLabProtocol.events(parsed.data.events) } }
  }

  /** One event, or null (logged) when it does not match §5. */
  static event(raw: unknown): LiveEvent | null {
    const parsed = eventSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('Ignoring an invalid live event', parsed.error.issues[0])
      return null
    }
    const data = parsed.data
    const event: LiveEvent = {
      version: data.version,
      at: data.at,
      actor: data.actor,
      tool: data.tool,
      summary: data.summary,
      deviceIds: [...data.deviceIds],
      linkIds: [...data.linkIds],
    }
    if (data.output !== undefined) {
      event.output = {
        deviceId: data.output.deviceId,
        command: data.output.command,
        lines: data.output.lines.slice(0, MAX_OUTPUT_LINES).map((line) => line.slice(0, MAX_LINE_LENGTH)),
      }
    }
    return event
  }

  private static events(raw: readonly unknown[]): LiveEvent[] {
    return raw.flatMap((item) => {
      const event = LiveLabProtocol.event(item)
      return event === null ? [] : [event]
    })
  }

  private static json(text: string): ProtocolResult<unknown> {
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch (error) {
      return { ok: false, reason: `Live message is not JSON: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}
