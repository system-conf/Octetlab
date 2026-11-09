// The app's IOS shell and fresh console sessions for one tool call. The MCP caller owns the lab, so a
// session starts already enabled (no console / enable password) and without paging.
import { CLI_COMMAND_SETS } from '../../../src/cli/commandSets'
import type { CliEnvironment, CliMode, CliSessionState } from '../../../src/cli/contract'
import { CliShell } from '../../../src/cli/core/CliShell'
import { LinkStatus } from '../../../src/cli/core/LinkStatus'
import type { Device, NetworkState } from '../../../src/domain'
import type { SimulationEngine } from '../../../src/sim/contract'

export class ConsoleSession {
  /** Stateless; built once per isolate. */
  static readonly shell = new CliShell(CLI_COMMAND_SETS)

  static state(device: Device, mode: CliMode): CliSessionState {
    return { deviceId: device.id, mode, phase: 'ready', history: { exec: [], config: [] }, terminalLength: 0, pending: null }
  }

  /** What handlers read: the lab with this copy of the device, and the simulator's tables when there is one. */
  static environment(network: NetworkState, device: Device, engine?: SimulationEngine): CliEnvironment {
    return {
      network: LinkStatus.withDevice(network, device),
      runtime: engine?.runtime(device.id),
      now: engine?.time ?? 0,
    }
  }
}
