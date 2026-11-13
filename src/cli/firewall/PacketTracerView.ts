// Text of `packet-tracer` (docs/FIREWALL_PACK.md §6.4): one block per phase with ALLOW / DROP, then the final
// result. Real-device phase wording is UNVERIFIED (§3), so the layout is generic and says it is a lab
// explanation of the configuration.
import type { TraceResult } from './FirewallDecision'

const NOTE = 'Lab explanation of the configuration: no packet is sent.'

export class PacketTracerView {
  static lines(result: TraceResult): string[] {
    const lines = [NOTE, '']
    result.phases.forEach((phase, index) => {
      lines.push(`Phase: ${index + 1}`, `Type: ${phase.type}`, `Result: ${phase.allowed ? 'ALLOW' : 'DROP'}`, ...phase.info.map((info) => `Info: ${info}`), '')
    })
    lines.push('Result:', `input-interface: ${result.inputInterface}`, `output-interface: ${result.outputInterface ?? 'none'}`, `Action: ${result.allowed ? 'allow' : 'drop'}`)
    if (result.dropReason !== null) lines.push(`Drop-reason: ${result.dropReason}`)
    return lines
  }
}
