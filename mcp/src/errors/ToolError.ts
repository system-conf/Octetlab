// A failure a tool reports to the model as `isError` with a clear sentence. Anything else that is
// thrown is unexpected: logged with its details and reported with a generic sentence.

/**
 * validation: bad input · notFound: unknown lab / device / link · limit: size or count limit ·
 * refused: the lab's rules say no · conflict: the lab kept changing under this call.
 */
export type ToolErrorKind = 'validation' | 'notFound' | 'limit' | 'refused' | 'conflict'

export class ToolError extends Error {
  readonly kind: ToolErrorKind
  /** Extra structured content for the model (e.g. build_lab's failed steps). */
  readonly details: Record<string, unknown> | undefined

  constructor(kind: ToolErrorKind, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ToolError'
    this.kind = kind
    this.details = details
  }

  static validation(message: string, details?: Record<string, unknown>): ToolError {
    return new ToolError('validation', message, details)
  }

  static notFound(message: string): ToolError {
    return new ToolError('notFound', message)
  }

  static limit(message: string): ToolError {
    return new ToolError('limit', message)
  }

  static refused(message: string): ToolError {
    return new ToolError('refused', message)
  }

  static conflict(message: string): ToolError {
    return new ToolError('conflict', message)
  }
}
