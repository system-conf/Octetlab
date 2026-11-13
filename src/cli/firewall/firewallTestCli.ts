// Test-only driver of the firewall CLI: a catalog firewall with every registered command set (the merge
// with router / ACL / NAT is part of what is tested), a runtime slot and a clock.
import type { Device } from '../../domain'
import type { DeviceRuntime } from '../../sim/contract'
import type { FirewallConnection } from '../../sim/contract/FirewallRuntime'
import type { NatTranslation } from '../../sim/contract/SecurityRuntime'
import { CLI_COMMAND_SETS } from '../commandSets'
import type { CliEnvironment } from '../contract'
import { FactoryReset } from '../core/FactoryReset'
import { CliDriver, catalogDevice } from '../core/testCli'

/** firewall3Port: Gi0/0 (wan), Gi0/1 (lan), Gi0/2 (DMZ), Console. */
export function testFirewall(): Device {
  return catalogDevice('firewall3Port', 'fw1', '00:D0:BA:00:00:F1')
}

/** The three interfaces of a classic inside / outside / DMZ appliance. */
export const THREE_LEGS = [
  'interface g0/0',
  'nameif outside',
  'ip address 203.0.113.2 255.255.255.252',
  'no shutdown',
  'interface g0/1',
  'nameif inside',
  'ip address 10.0.0.1 255.255.255.0',
  'no shutdown',
  'interface g0/2',
  'nameif dmz',
  'security-level 50',
  'ip address 172.16.0.1 255.255.255.0',
  'no shutdown',
  'exit',
]

export class FirewallCli extends CliDriver {
  runtime: DeviceRuntime | undefined = undefined
  now = 0

  constructor(device: Device = testFirewall()) {
    super(device, CLI_COMMAND_SETS)
  }

  override get env(): CliEnvironment {
    return { network: { devices: [this.device], links: [] }, runtime: this.runtime, now: this.now }
  }

  /** `enable` + `configure terminal` + the lines; returns the output of the last line. */
  configure(...lines: readonly string[]): string[] {
    this.typeAll('enable', 'configure terminal')
    return this.typeAll(...lines)
  }

  /** Every output line of every input. */
  all(...lines: readonly string[]): string[] {
    return lines.flatMap((line) => this.type(line))
  }

  config(): string[] {
    return this.shell.runningConfig(this.device)
  }

  /** The device a reload with this running-config as startup-config would give. */
  replayed(): Device {
    return this.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(this.device)), this.config().join('\n'))
  }

  withTables(connections: readonly FirewallConnection[], translations: readonly NatTranslation[] = []): void {
    this.runtime = {
      deviceId: this.device.id,
      link: { arp: [], macTable: [], pending: [], claims: [], seenFrames: [] },
      network: { routes: [], sessions: [], ipIdentification: 0, echoIdentifier: 0 },
      services: { dhcpBindings: [], dhcpClients: [], dnsCache: [], sessions: [], nextEphemeralPort: 49152 },
      extensions: { firewallConnections: connections, natTranslations: translations },
    }
  }
}
