// Live labs (docs/LIVE_LABS.md §6, §8): where the MCP Worker serves a lab's live state.

/** The deployed MCP Worker; a build can point elsewhere with VITE_LIVE_API_ORIGIN. */
export const DEFAULT_LIVE_API_ORIGIN = 'https://octetlabmcp.slovveis.workers.dev'

/** URLs of one live lab on the MCP Worker: the catch-up document (HTTP) and the WebSocket. */
export class LiveLabEndpoints {
  private readonly origin: URL

  /** `origin`: an http(s) origin; anything else is a configuration error and throws. */
  constructor(origin: string) {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Live lab API origin must be http(s): ${origin}`)
    this.origin = url
  }

  /** From the build setting (VITE_LIVE_API_ORIGIN), or the deployed MCP Worker. */
  static fromEnvironment(): LiveLabEndpoints {
    const configured = import.meta.env.VITE_LIVE_API_ORIGIN?.trim()
    return new LiveLabEndpoints(configured === undefined || configured === '' ? DEFAULT_LIVE_API_ORIGIN : configured)
  }

  /** `GET /live/<labId>`: `{ labId, version, doc, events }` or 404. */
  documentUrl(labId: string): string {
    return new URL(`/live/${encodeURIComponent(labId)}`, this.origin).toString()
  }

  /** `/live/<labId>/socket` with ws(s): the same host as the HTTP origin. */
  socketUrl(labId: string): string {
    const url = new URL(`/live/${encodeURIComponent(labId)}/socket`, this.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  }
}
