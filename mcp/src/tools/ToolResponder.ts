// Every tool's result: short text plus structuredContent, or `isError` with a clear sentence. A
// ToolError's message goes to the model as is; anything else is logged with its details and reported
// as an unexpected failure (no stack traces or internals in the result). Changes to a lab go through
// withLab: compare-and-set on the lab's version, one retry, and exactly one live event per call.
import type { CallToolResult } from '@modelcontextprotocol/server'
import type { LabDocument } from '../../../src/domain'
import { ToolError } from '../errors/ToolError'
import type { LiveEventDescription, LiveEventDraft } from '../live/LiveEvent'
import type { LiveLinks } from '../live/LiveLinks'
import type { LabStore } from '../store/LabStore'

export interface ToolOutput {
  text: string
  structured?: Record<string, unknown>
  /** The lab this result is about: its `liveUrl` is added to the structured content. */
  labId?: string
}

const ERROR_LABEL: Readonly<Record<ToolError['kind'], string>> = {
  validation: 'Invalid input',
  notFound: 'Not found',
  limit: 'Limit reached',
  refused: 'Not allowed',
  conflict: 'Lab busy',
}

/** Load → change → compare-and-set write; a conflicting write is retried this many times. */
const CONFLICT_RETRIES = 1

export class ToolResponder {
  private readonly labs: LabStore
  private readonly liveLinks: LiveLinks
  private readonly now: () => Date

  constructor(labs: LabStore, liveLinks: LiveLinks, now: () => Date = () => new Date()) {
    this.labs = labs
    this.liveLinks = liveLinks
    this.now = now
  }

  async respond(toolName: string, action: () => Promise<ToolOutput> | ToolOutput): Promise<CallToolResult> {
    try {
      const output = await action()
      const structured = output.labId === undefined ? output.structured : { ...output.structured, liveUrl: this.liveLinks.url(output.labId) }
      return {
        content: [{ type: 'text', text: output.text }],
        ...(structured === undefined ? {} : { structuredContent: structured }),
      }
    } catch (error) {
      return this.failure(toolName, error)
    }
  }

  /**
   * Loads the lab, applies `change` and saves the result when it is a different document (else the
   * call is only noted in the live feed). `describe` tells watchers what happened. When another call
   * changed the lab in between, the change is re-applied once on the newer lab.
   */
  async withLab<Result extends { doc: LabDocument }>(
    labId: string,
    toolName: string,
    change: (doc: LabDocument) => Result,
    describe: (result: Result) => LiveEventDescription,
  ): Promise<Result> {
    for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt++) {
      const { doc, version } = await this.labs.loadVersioned(labId)
      const result = change(doc)
      const event = this.event(toolName, describe(result))
      if (result.doc === doc) {
        await this.labs.note(labId, event)
        return result
      }
      const saved = await this.labs.save(labId, result.doc, version, event)
      if (saved.ok) return { ...result, doc: saved.doc }
    }
    throw ToolError.conflict(`Lab ${labId} was changed by another request at the same time, so this change was not saved. Call get_lab and try again.`)
  }

  /** A live event of this tool, stamped now. */
  event(toolName: string, description: LiveEventDescription): LiveEventDraft {
    return { at: this.now().toISOString(), actor: 'assistant', tool: toolName, ...description }
  }

  private failure(toolName: string, error: unknown): CallToolResult {
    if (error instanceof ToolError) {
      return {
        isError: true,
        content: [{ type: 'text', text: `${ERROR_LABEL[error.kind]}: ${error.message}` }],
        structuredContent: { error: error.kind, message: error.message, ...error.details },
      }
    }
    console.error(`Tool ${toolName} failed unexpectedly`, error)
    const message = `${toolName} failed because of an unexpected server error. The lab was not changed by this call; try again, and if it keeps failing, report it to the Octetlab owner.`
    return { isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: 'unexpected', message } }
  }
}
