// The Worker's bindings (mcp/wrangler.jsonc), declared with only the members this Worker uses so the
// code type-checks against the same DOM lib as Octetlab's modules (no global Workers runtime types).

/** Workers KV namespace (text values only). */
export interface KvNamespaceBinding {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

/** Workers rate-limit binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface WorkerEnv {
  /** Stored labs: key `lab:<id>`, value = serialized LabDocument, 7-day TTL. */
  LABS: KvNamespaceBinding
  MCP_RATE_LIMITER: RateLimitBinding
  /** Web app page that opens share links, e.g. https://octetlab.slovveis.workers.dev/lab. */
  APP_LAB_URL: string
}
