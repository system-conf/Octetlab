// Test helper: calls the real MCP HTTP handler (Agents SDK, stateless) with plain JSON-RPC requests, the
// way a 2025-era connector such as ChatGPT does, on an in-memory lab store.
import { createMcpHandler } from 'agents/mcp/server'
import { MemoryKeyValueStore } from '../store/MemoryKeyValueStore'
import { createOctetlabServer } from './createOctetlabServer'

export const TEST_APP_LAB_URL = 'https://octetlab.example.workers.dev/lab'
/** Not localhost or workers.dev: Node's Request drops the Host header, which the handler checks for those hosts. */
const TEST_ENDPOINT = 'http://mcp.test/mcp'

export interface ToolCallResult {
  isError: boolean
  text: string
  structured: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class McpTestClient {
  readonly store = new MemoryKeyValueStore()
  private readonly handler = createMcpHandler(() => createOctetlabServer({ store: this.store, appLabUrl: TEST_APP_LAB_URL }))
  private nextId = 1

  /** The JSON-RPC `result` of one request (throws on a JSON-RPC error). */
  async request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++
    const response = await this.handler.fetch(
      new Request(TEST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      }),
    )
    const message = McpTestClient.message(await response.text(), response.headers.get('content-type') ?? '')
    if (!isRecord(message) || !isRecord(message.result)) throw new Error(`JSON-RPC failure (${response.status}): ${JSON.stringify(message)}`)
    return message.result
  }

  initialize(): Promise<Record<string, unknown>> {
    return this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'octetlab-test', version: '1.0.0' } })
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const result = await this.request('tools/call', { name, arguments: args })
    const content = Array.isArray(result.content) ? result.content : []
    const text = content.map((block: unknown) => (isRecord(block) && typeof block.text === 'string' ? block.text : '')).join('\n')
    return { isError: result.isError === true, text, structured: isRecord(result.structuredContent) ? result.structuredContent : {} }
  }

  /** A successful call's structured content (fails the test with the error text otherwise). */
  async ok(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const result = await this.call(name, args)
    if (result.isError) throw new Error(`${name} failed: ${result.text}`)
    return result
  }

  private static message(body: string, contentType: string): unknown {
    if (!contentType.includes('text/event-stream')) return JSON.parse(body)
    const data = body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .filter((line) => line !== '')
    const last = data.at(-1)
    if (last === undefined) throw new Error(`Empty event stream: ${body}`)
    return JSON.parse(last)
  }
}
