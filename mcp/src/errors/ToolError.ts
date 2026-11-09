// A failure a tool reports to the model as `isError` with a clear sentence. Anything else that is
// thrown is unexpected: logged with its details and reported with a generic sentence.

/** validation: bad input · notFound: unknown lab / device / link · limit: size or count limit · refused: the lab's rules say no. */
export type ToolErrorKind = 'validation' | 'notFound' | 'limit' | 'refused'

export class ToolError extends Error {
  readonly kind: ToolErrorKind

  constructor(kind: ToolErrorKind, message: string) {
    super(message)
    this.name = 'ToolError'
    this.kind = kind
  }

  static validation(message: string): ToolError {
    return new ToolError('validation', message)
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
}
