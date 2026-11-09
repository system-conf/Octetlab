// run_command: builds the lab's packet simulator (settled start-up traffic) and runs one command on the
// device's terminal: the IOS console for routers / managed switches, the command prompt for computers.
// The simulator lives for this call only; the lab's configuration is what persists.
import { DeviceConfigText } from '../../../src/cli/config/DeviceConfigText'
import type { LabDocument } from '../../../src/domain'
import { TerminalAvailability } from '../../../src/net/TerminalAvailability'
import { createSimulation } from '../../../src/sim/createSimulation'
import { ToolError } from '../errors/ToolError'
import type { DeviceAccess } from '../lab/DeviceAccess'
import type { CommandOutput } from './CommandOutput'
import type { DeviceCliRunner } from './DeviceCliRunner'
import type { HostTerminalRunner } from './HostTerminalRunner'

export class CommandRunner {
  private readonly devices: DeviceAccess
  private readonly deviceCli: DeviceCliRunner
  private readonly hostTerminal: HostTerminalRunner

  constructor(devices: DeviceAccess, deviceCli: DeviceCliRunner, hostTerminal: HostTerminalRunner) {
    this.devices = devices
    this.deviceCli = deviceCli
    this.hostTerminal = hostTerminal
  }

  run(doc: LabDocument, deviceId: string, command: string): CommandOutput {
    const device = this.devices.require(doc, deviceId)
    const hasCli = DeviceConfigText.hasCli(device)
    if (!hasCli && !TerminalAvailability.isAvailable(device)) {
      throw ToolError.validation(
        `${device.id} (${device.modelId}) has no terminal. Commands run on routers, managed switches, PCs, laptops, servers, POS terminals and NVRs.`,
      )
    }
    const engine = createSimulation(doc.state)
    return hasCli ? this.deviceCli.run(doc, device, engine, command) : this.hostTerminal.run(doc, device, engine, command)
  }
}
