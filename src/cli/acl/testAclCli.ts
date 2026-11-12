// Test-only: a router CLI with the router and ACL command sets, a runtime slot for the hit counters.
import type { Device } from '../../domain'
import type { DeviceRuntime } from '../../sim/contract'
import type { AclCounters } from '../../sim/contract/SecurityRuntime'
import type { CliEnvironment } from '../contract'
import { CliDriver, testRouter } from '../core/testCli'
import { routerCommandSet } from '../router/routerCommandSet'
import { aclCommandSet } from './aclCommandSet'

export class AclCli extends CliDriver {
  runtime: DeviceRuntime | undefined = undefined

  constructor(device: Device = testRouter()) {
    super(device, [routerCommandSet, aclCommandSet])
  }

  override get env(): CliEnvironment {
    return { network: { devices: [this.device], links: [] }, runtime: this.runtime, now: 0 }
  }

  /** `enable` + `configure terminal` + the lines; returns the output of the last line. */
  configure(...lines: readonly string[]): string[] {
    this.typeAll('enable', 'configure terminal')
    return this.typeAll(...lines)
  }

  /** Every output line of every input line. */
  all(...lines: readonly string[]): string[] {
    return lines.flatMap((line) => this.type(line))
  }

  config(): string[] {
    return this.shell.runningConfig(this.device)
  }

  withCounters(aclCounters: AclCounters): void {
    this.runtime = {
      deviceId: this.device.id,
      link: { arp: [], macTable: [], pending: [], claims: [], seenFrames: [] },
      network: { routes: [], sessions: [], ipIdentification: 0, echoIdentifier: 0 },
      services: { dhcpBindings: [], dhcpClients: [], dnsCache: [], sessions: [], nextEphemeralPort: 49152 },
      extensions: { aclCounters },
    }
  }
}
