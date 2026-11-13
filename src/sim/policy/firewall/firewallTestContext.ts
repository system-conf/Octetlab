// Test-only: a minimal DeviceContext / EventBuilder pair to drive the policies packet by packet, and
// packet builders. Only the members the policies read are real; the rest is never called.
import type { Device } from '../../../domain'
import type { DeviceContext, DeviceRuntime, EventBuilder, Ipv4Packet, TcpFlag } from '../../contract'

export interface PolicyHarness {
  readonly ctx: DeviceContext
  readonly event: EventBuilder
  readonly notes: string[]
  setNow(now: number): void
  runtime(): DeviceRuntime
}

export function policyHarness(device: Device): PolicyHarness {
  let runtime = { extensions: {} } as DeviceRuntime
  let now = 0
  const notes: string[] = []
  const ctx = {
    device,
    get now() {
      return now
    },
    get runtime() {
      return runtime
    },
    updateRuntime(change: (current: DeviceRuntime) => DeviceRuntime) {
      runtime = change(runtime)
    },
  } as DeviceContext
  const event = { note: (_layer: number, _direction: string, message: { key: string }) => notes.push(message.key) } as unknown as EventBuilder
  return { ctx, event, notes, setNow: (time) => (now = time), runtime: () => runtime }
}

export function tcpPacket(src: string, srcPort: number, dst: string, dstPort: number, flags: TcpFlag[]): Ipv4Packet {
  return { kind: 'ipv4', src, dst, ttl: 64, identification: 1, payload: { kind: 'tcp', srcPort, dstPort, flags, payload: null } }
}

export function udpPacket(src: string, srcPort: number, dst: string, dstPort: number): Ipv4Packet {
  return { kind: 'ipv4', src, dst, ttl: 64, identification: 1, payload: { kind: 'udp', srcPort, dstPort, payload: { kind: 'data', bytes: 8 } } }
}
