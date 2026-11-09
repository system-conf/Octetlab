// One command in an end device's Windows-style prompt: HostCommandLayer first (hostname, netstat,
// ipconfig /displaydns…), else the simulator terminal (ping, tracert, nslookup, ipconfig /renew, arp).
// DHCP results change the lab's configuration; they are applied when the state stays valid.
import { HostCommandLayer } from '../../../src/cli/host/HostCommandLayer'
import { StateInvariants, type Device, type LabDocument } from '../../../src/domain'
import type { SimulationEngine } from '../../../src/sim/contract'
import { SimTerminal } from '../../../src/sim/terminal/SimTerminal'
import type { EnglishMessages } from '../text/EnglishMessages'
import type { CommandOutput } from './CommandOutput'
import { ConsoleSession } from './ConsoleSession'

export class HostTerminalRunner {
  private readonly messages: EnglishMessages
  private readonly terminal = new SimTerminal()
  private readonly invariants = new StateInvariants()

  constructor(messages: EnglishMessages) {
    this.messages = messages
  }

  run(doc: LabDocument, device: Device, engine: SimulationEngine, command: string): CommandOutput {
    const lines = [`C:\\>${command}`]
    const layered = HostCommandLayer.run(device, ConsoleSession.environment(doc.state, device, engine), command)
    if (layered !== null) {
      lines.push(...this.messages.lines(layered.lines))
      return { lines, changed: false, doc, settleTruncated: engine.settleTruncated }
    }
    const outcome = this.terminal.run(engine, device.id, command)
    lines.push(...this.messages.lines(outcome.lines))
    const next = outcome.effects.length > 0 && outcome.nextState !== undefined ? outcome.nextState : null
    if (next === null) return { lines, changed: false, doc, settleTruncated: engine.settleTruncated }
    const violations = this.invariants.violations(next)
    if (violations.length > 0) {
      console.error('HostTerminalRunner: the simulator state after the command breaks lab invariants; not saved', violations)
      lines.push('(The address change could not be saved to the lab.)')
      return { lines, changed: false, doc, settleTruncated: engine.settleTruncated }
    }
    return { lines, changed: true, doc: { ...doc, state: next }, settleTruncated: engine.settleTruncated }
  }
}
