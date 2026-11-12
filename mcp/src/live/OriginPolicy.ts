// Which web pages may read live labs (docs/LIVE_LABS.md §6): the APP_ORIGINS wrangler var, a
// comma-separated list of exact origins (scheme + host + port, no path).

export class OriginPolicy {
  private readonly origins: ReadonlySet<string>

  constructor(commaSeparated: string) {
    this.origins = new Set(
      commaSeparated
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter((origin) => origin !== ''),
    )
  }

  /** The request's Origin when it is allowed, else null (a missing Origin is not allowed). */
  allowed(request: Request): string | null {
    const origin = request.headers.get('Origin')
    return origin !== null && this.origins.has(origin) ? origin : null
  }
}
