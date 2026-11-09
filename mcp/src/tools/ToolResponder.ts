// Every tool's result: short text plus structuredContent, or `isError` with a clear sentence. A
// ToolError's message goes to the model as is; anything else is logged with its details and reported
// as an unexpected failure (no stack traces or internals in the result).
import type { CallToolResult } from '@modelcontextprotocol/server'
import type { LabDocument } from '../../../src/domain'
import { ToolError } from '../errors/ToolError'
import type { LabStore } from '../store/LabStore'

export interface ToolOutput {
  text: string
  structured?: Record<string, unknown>
}

const ERROR_LABEL: Readonly<Record<ToolError['kind'], string>> = {
  validation: 'Invalid input',
  notFound: 'Not found',
  limit: 'Limit reached',
  refused: 'Not allowed',
}

export class ToolResponder {
  private readonly labs: LabStore

  constructor(labs: LabStore) {
    this.labs = labs
  }

  async respond(toolName: string, action: () => Promise<ToolOutput> | ToolOutput): Promise<CallToolResult> {
    try {
      const output = await action()
      return {
        content: [{ type: 'text', text: output.text }],
        ...(output.structured === undefined ? {} : { structuredContent: output.structured }),
      }
    } catch (error) {
      return this.failure(toolName, error)
    }
  }

  /** Loads the lab, applies `change`, saves the lab when `change` returned a different document. */
  async withLab<Result extends { doc: LabDocument }>(labId: string, change: (doc: LabDocument) => Result): Promise<Result> {
    const doc = await this.labs.load(labId)
    const result = change(doc)
    if (result.doc === doc) return result
    const saved = await this.labs.save(labId, result.doc)
    return { ...result, doc: saved }
  }

  private failure(toolName: string, error: unknown): CallToolResult {
    if (error instanceof ToolError) {
      return { isError: true, content: [{ type: 'text', text: `${ERROR_LABEL[error.kind]}: ${error.message}` }], structuredContent: { error: error.kind, message: error.message } }
    }
    console.error(`Tool ${toolName} failed unexpectedly`, error)
    const message = `${toolName} failed because of an unexpected server error. The lab was not changed by this call; try again, and if it keeps failing, report it to the Octetlab owner.`
    return { isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: 'unexpected', message } }
  }
}
