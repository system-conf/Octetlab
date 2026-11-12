// Test-only driver of the remote-access set: the router set plus this one, with lab peers and links.
import type { Device, Link } from '../../domain'
import type { RequestRecord } from '../../sim/contract'
import type { CliEnvironment } from '../contract'
import { CliDriver, testRouter } from '../core/testCli'
import { routerCommandSet } from '../router/routerCommandSet'
import { remoteAccessCommandSet } from './remoteAccessCommandSet'

export class RemoteCli extends CliDriver {
  peers: Device[] = []
  links: Link[] = []

  constructor(device: Device = testRouter()) {
    super(device, [routerCommandSet, remoteAccessCommandSet])
  }

  override get env(): CliEnvironment {
    return { network: { devices: [this.device, ...this.peers], links: this.links }, runtime: undefined, now: 0 }
  }

  /** `enable` + `configure terminal`, then the lines; returns the output of the last one. */
  configure(...lines: readonly string[]): string[] {
    this.typeAll('enable', 'configure terminal')
    return this.typeAll(...lines)
  }

  finish(record: RequestRecord): string[] {
    return this.take(this.shell.resume(this.state, this.device, this.env, record))
  }

  config(): string[] {
    return this.shell.runningConfig(this.device)
  }
}
