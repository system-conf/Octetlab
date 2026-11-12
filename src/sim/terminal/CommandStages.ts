import type { NetworkState, PacketTrace, TerminalLine } from '../../domain'
import type { PingSettings } from '../../engine/PingOptions'
import type { RequestRecord, StateEffect } from '../contract'

/** What a terminal command printed and changed (docs/SIMULATION.md §10.1). */
export interface SimCommandOutcome {
  lines: TerminalLine[]
  /** Configuration changes of the command (DHCP), already applied to the engine; the session applies them to the lab. */
  effects: readonly StateEffect[]
  /** The engine's configuration after the effects (set when there are effects). */
  nextState?: NetworkState
  /** Set by ping and tracert (the map animation), like the rule engine's. */
  trace?: PacketTrace
}

/** A command finished at once, or waits for the engine request `requestId`. */
export type SimCommandStart = { kind: 'done'; outcome: SimCommandOutcome } | { kind: 'pending'; requestId: string }

/** The probe a ping / tracert command sends once its target address is known. */
export type ProbeCommand = { readonly kind: 'ping'; readonly settings: PingSettings } | { readonly kind: 'tracert' }

/** What a command waits for while its engine request runs. */
export type CommandStage =
  /** A name lookup before ping / tracert (`dnsQuery` with the resolver cache). */
  | { readonly kind: 'lookup'; readonly deviceId: string; readonly name: string; readonly then: ProbeCommand }
  /** The echoes themselves; `fromEventId` / `fromTransmissionId` = the logs' ends when it was queued. */
  | {
      readonly kind: 'probe'
      readonly deviceId: string
      readonly targetIp: string
      readonly name: string | null
      readonly command: ProbeCommand
      readonly fromEventId: number
      readonly fromTransmissionId: number
    }
  | { readonly kind: 'nslookup'; readonly deviceId: string; readonly name: string }
  | { readonly kind: 'dhcp'; readonly deviceId: string }
  | { readonly kind: 'arpClear'; readonly deviceId: string }
  /** Pack 5.2: `ssh` / `telnet` (the output comes from the record alone). */
  | { readonly kind: 'remote'; readonly deviceId: string }

export class CommandStages {
  /**
   * The stage of a request the terminal did not start itself (e.g. after the engine was rebuilt from a
   * snapshot): mapped from the request alone, without the command line's extras (names, `-t` notes).
   */
  static fromRecord(record: RequestRecord): CommandStage {
    const { request } = record
    const deviceId = request.deviceId
    switch (request.kind) {
      case 'ping': {
        const settings: PingSettings = { target: request.targetIp, count: request.count, size: request.size, continuous: false, countLimited: false }
        return CommandStages.probe(deviceId, request.targetIp, null, { kind: 'ping', settings })
      }
      case 'tracert':
        return CommandStages.probe(deviceId, request.targetIp, null, { kind: 'tracert' })
      case 'dnsQuery':
        return { kind: 'nslookup', deviceId, name: request.name }
      case 'dhcpRenew':
      case 'dhcpRelease':
        return { kind: 'dhcp', deviceId }
      case 'remoteConnect':
        return { kind: 'remote', deviceId }
      case 'clearTable':
      case 'httpGet':
        return { kind: 'arpClear', deviceId }
    }
  }

  private static probe(deviceId: string, targetIp: string, name: string | null, command: ProbeCommand): CommandStage {
    return { kind: 'probe', deviceId, targetIp, name, command, fromEventId: 0, fromTransmissionId: 0 }
  }
}
