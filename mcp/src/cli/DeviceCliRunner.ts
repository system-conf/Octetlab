// One EXEC command on a router / switch console (show …, ping, traceroute, write memory). Jobs run on
// the lab's packet simulator; questions ([confirm], "Destination filename") are answered with Enter.
import type { CliSessionState, CliStep } from '../../../src/cli/contract'
import { CliPrompt } from '../../../src/cli/core/CliPrompt'
import type { Device, LabDocument } from '../../../src/domain'
import type { SimulationEngine } from '../../../src/sim/contract'
import type { DeviceAccess } from '../lab/DeviceAccess'
import type { EnglishMessages } from '../text/EnglishMessages'
import type { CommandOutput } from './CommandOutput'
import { ConsoleSession } from './ConsoleSession'

/** Questions and jobs one command may chain (a guard against a command that never settles). */
const MAX_FOLLOW_UPS = 8

export class DeviceCliRunner {
  private readonly devices: DeviceAccess
  private readonly messages: EnglishMessages

  constructor(devices: DeviceAccess, messages: EnglishMessages) {
    this.devices = devices
    this.messages = messages
  }

  run(doc: LabDocument, device: Device, engine: SimulationEngine, command: string): CommandOutput {
    const shell = ConsoleSession.shell
    const state = ConsoleSession.state(device, { kind: 'privilegedExec' })
    const lines = [`${CliPrompt.render(device, state.mode)}${command}`]
    let step = shell.submit(state, device, ConsoleSession.environment(doc.state, device, engine), command)
    let current = step.device ?? device
    lines.push(...this.messages.lines(step.lines))
    for (let round = 0; round < MAX_FOLLOW_UPS && (step.job !== undefined || step.state.pending?.kind === 'question'); round += 1) {
      step = this.followUp(step, current, doc, engine, lines)
      current = step.device ?? current
      lines.push(...this.messages.lines(step.lines))
    }
    if (step.job !== undefined || step.state.pending !== null) lines.push('(The command did not finish within this call.)')
    const changed = current !== device
    return { lines, changed, doc: changed ? this.devices.update(doc, current) : doc, settleTruncated: engine.settleTruncated }
  }

  private followUp(step: CliStep, device: Device, doc: LabDocument, engine: SimulationEngine, lines: string[]): CliStep {
    const shell = ConsoleSession.shell
    const state: CliSessionState = step.state
    if (step.job !== undefined) {
      const requestId = engine.inject(step.job)
      engine.runUntilDone(requestId)
      const record = engine.request(requestId)
      if (record === undefined) throw new Error(`Simulator lost request ${requestId}`)
      return shell.resume(state, device, ConsoleSession.environment(doc.state, device, engine), record)
    }
    lines.push(`${step.prompt}(Enter)`)
    return shell.submit(state, device, ConsoleSession.environment(doc.state, device, engine), '')
  }
}
