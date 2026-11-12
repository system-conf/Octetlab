// Live labs (docs/LIVE_LABS.md §5–6): what the assistant did, and the messages a watching browser gets.

export interface LiveEventOutput {
  deviceId: string
  command: string
  /** At most MAX_EVENT_OUTPUT_LINES. */
  lines: string[]
}

export interface LiveEvent {
  /** Doc version after the change (or the current version for a note). */
  version: number
  /** ISO time. */
  at: string
  actor: 'assistant'
  /** MCP tool name, e.g. 'add_device'. */
  tool: string
  /** One English sentence. */
  summary: string
  deviceIds: string[]
  linkIds: string[]
  output?: LiveEventOutput
}

/** An event before the room stamps it with its version (the room owns the version counter). */
export type LiveEventDraft = Omit<LiveEvent, 'version'>

/** What a tool says about its own change; the time and actor are added by ToolResponder. */
export type LiveEventDescription = Omit<LiveEventDraft, 'at' | 'actor' | 'tool'>

export type LiveServerMessage =
  | { type: 'snapshot'; version: number; doc: string; events: LiveEvent[] }
  | { type: 'update'; version: number; doc: string; event: LiveEvent }
  | { type: 'event'; event: LiveEvent }
  | { type: 'expired' }
  | { type: 'pong' }

/** Events kept per room (ring buffer). */
export const MAX_ROOM_EVENTS = 50
/** run_command output lines kept in an event. */
export const MAX_EVENT_OUTPUT_LINES = 200
/** Characters kept per output line. */
export const MAX_EVENT_LINE_LENGTH = 500
/** Browsers watching one room at a time. */
export const MAX_ROOM_WATCHERS = 20
/** Largest message a browser may send (only pings are expected). */
export const MAX_CLIENT_MESSAGE_BYTES = 1024
/** A room lives this long after its last write. */
export const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const PING_MESSAGE = JSON.stringify({ type: 'ping' })
export const PONG_MESSAGE = JSON.stringify({ type: 'pong' })

/** Output trimmed to the event limits. */
export function eventOutput(deviceId: string, command: string, lines: readonly string[]): LiveEventOutput {
  const kept = lines.slice(0, MAX_EVENT_OUTPUT_LINES).map((line) => (line.length > MAX_EVENT_LINE_LENGTH ? `${line.slice(0, MAX_EVENT_LINE_LENGTH)}…` : line))
  if (lines.length > MAX_EVENT_OUTPUT_LINES) kept[kept.length - 1] = `… (${lines.length - MAX_EVENT_OUTPUT_LINES + 1} more lines)`
  return { deviceId, command, lines: kept }
}
