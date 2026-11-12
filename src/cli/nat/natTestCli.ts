// Test-only driver of the NAT command set: the router set plus NAT, a runtime and a clock.
import type { Device } from '../../domain'
import type { DeviceRuntime } from '../../sim/contract'
import type { NatStatistics, NatTranslation } from '../../sim/contract/SecurityRuntime'
import type { CliEnvironment } from '../contract'
import { CliDriver, testRouter } from '../core/testCli'
import { routerCommandSet } from '../router/routerCommandSet'
import { runtimeOf } from '../router/testRouterCli'
import { natCommandSet } from './natCommandSet'

export class NatCli extends CliDriver {
  runtime: DeviceRuntime | undefined = undefined
  now = 0

  constructor(device: Device = testRouter()) {
    super(device, [routerCommandSet, natCommandSet])
  }

  override get env(): CliEnvironment {
    return { network: { devices: [this.device], links: [] }, runtime: this.runtime, now: this.now }
  }

  configure(...lines: readonly string[]): string[] {
    this.typeAll('enable', 'configure terminal')
    return this.typeAll(...lines)
  }

  /** Puts NAT rows and counters into the runtime the show commands read. */
  withTable(translations: readonly NatTranslation[], natStatistics: NatStatistics): void {
    this.runtime = { ...runtimeOf(this.device.id, {}), extensions: { natTranslations: translations, natStatistics } }
  }

  config(): string[] {
    return this.shell.runningConfig(this.device)
  }
}
