import type { TerminalLine } from '../../domain'
import { ArpFormatter } from '../../engine/ArpFormatter'
import { CommandFormatter } from '../../engine/CommandFormatter'
import { CommandOptions } from '../../engine/CommandOptions'
import { PingFormatter } from '../../engine/PingFormatter'
import { PingOptions } from '../../engine/PingOptions'
import { TracertCommand } from '../../engine/TracertCommand'
import { TracertFormatter } from '../../engine/TracertFormatter'
import { Ipv4 } from '../../net/Ipv4'
import { TerminalAvailability } from '../../net/TerminalAvailability'
import { Topology } from '../../net/Topology'
import type { SimRequest, SimulationEngine } from '../contract'
import { CommandOutcomes } from './CommandOutcomes'
import { type CommandStage, CommandStages, type ProbeCommand, type SimCommandOutcome, type SimCommandStart } from './CommandStages'
import { RemoteCommands } from './RemoteCommands'
import { SimHostViews } from './SimHostViews'

const KNOWN_COMMANDS: ReadonlySet<string> = new Set(['ipconfig', 'ping', 'tracert', 'nslookup', 'arp', 'ssh', 'telnet'])
/** Windows tracert sends three probes per hop. */
const TRACERT_PROBES = 3
const NO_EFFECTS: SimCommandOutcome['effects'] = []

function done(lines: TerminalLine[]): SimCommandStart {
  return { kind: 'done', outcome: { lines, effects: NO_EFFECTS } }
}

/**
 * The host command prompt on the packet simulator (docs/SIMULATION.md §10.1): the rule engine's
 * HostCommandShell parsing and formatters, with ping, tracert, nslookup, ipconfig /renew /release and
 * `arp -d` answered by engine requests, and `arp -a` read from the device's ARP cache.
 *
 * A command that needs the network is pending on an engine request (ping by name: first a `dnsQuery`,
 * then the `ping`). Two ways to follow it:
 * - `advance(engine, requestId)` (also `SimTerminal.collect`): once that request is done, the outcome or
 *   the next request to wait for;
 * - `collect(engine, handle)`: the id `start` returned stays the handle; null until the command finished.
 * `run` does start + runUntilDone + advance (realtime, tests). What a pending command still needs is
 * kept per engine instance, so one SimTerminal serves several engines.
 */
export class SimTerminal {
  private static readonly shared = new SimTerminal()

  private readonly formatter = new CommandFormatter()
  private readonly pingFormatter = new PingFormatter()
  private readonly tracertFormatter = new TracertFormatter()
  private readonly arpFormatter = new ArpFormatter()
  private readonly outcomes = new CommandOutcomes({ command: this.formatter, ping: this.pingFormatter, tracert: this.tracertFormatter })
  private readonly stages = new WeakMap<SimulationEngine, Map<string, CommandStage>>()
  private readonly handles = new WeakMap<SimulationEngine, Map<string, string>>()

  static start(engine: SimulationEngine, deviceId: string, commandLine: string): SimCommandStart {
    return SimTerminal.shared.start(engine, deviceId, commandLine)
  }

  /** `advance` of the shared terminal: the request is done → the outcome, or the command's next request. */
  static collect(engine: SimulationEngine, requestId: string): SimCommandStart {
    return SimTerminal.shared.advance(engine, requestId)
  }

  static run(engine: SimulationEngine, deviceId: string, commandLine: string): SimCommandOutcome {
    return SimTerminal.shared.run(engine, deviceId, commandLine)
  }

  /** Starts a command. Immediate commands (help, ipconfig, arp -a, usage errors) return 'done'. Unknown device = throws. */
  start(engine: SimulationEngine, deviceId: string, commandLine: string): SimCommandStart {
    const device = Topology.of(engine.network()).require(deviceId)
    const [rawCommand, ...args] = commandLine.trim().split(/\s+/).filter((token) => token !== '')
    if (rawCommand === undefined) return done([])
    const command = rawCommand.toLowerCase()
    const { formatter } = this

    if (command === 'help') return done(formatter.help())
    if (!TerminalAvailability.isAvailable(device)) return done(formatter.noTerminal())
    if (!device.powered) return done(formatter.devicePoweredOff())
    if (!KNOWN_COMMANDS.has(command)) return done(formatter.unknownCommand(rawCommand))

    const started = this.startCommand(engine, deviceId, command, args)
    if (started.kind === 'pending') this.handlesOf(engine).set(started.requestId, started.requestId)
    return started
  }

  /** Once the request is done: the command's outcome, or the next request it waits for. Still running → pending on the same id. */
  advance(engine: SimulationEngine, requestId: string): SimCommandStart {
    const record = engine.request(requestId)
    if (!record) throw new Error(`Unknown request: ${requestId}`)
    if (record.status !== 'done') return { kind: 'pending', requestId }
    return this.finish(engine, requestId)
  }

  /** The outcome once the command `start` returned `handle` for has finished, else null. */
  collect(engine: SimulationEngine, handle: string): SimCommandOutcome | null {
    const handles = this.handlesOf(engine)
    const current = handles.get(handle) ?? handle
    const record = engine.request(current)
    if (!record || record.status !== 'done') return null
    const next = this.finish(engine, current)
    if (next.kind === 'pending') {
      handles.set(handle, next.requestId)
      return null
    }
    handles.delete(handle)
    return next.outcome
  }

  /** start, then run every request of the command to its end. */
  run(engine: SimulationEngine, deviceId: string, commandLine: string): SimCommandOutcome {
    let step = this.start(engine, deviceId, commandLine)
    while (step.kind === 'pending') {
      engine.runUntilDone(step.requestId)
      step = this.finish(engine, step.requestId)
    }
    return step.outcome
  }

  // ------------------------------------------------------------ commands

  private startCommand(engine: SimulationEngine, deviceId: string, command: string, args: string[]): SimCommandStart {
    switch (command) {
      case 'ipconfig':
        return this.ipconfig(engine, deviceId, args)
      case 'ping': {
        const parsed = PingOptions.parse(args)
        if (!parsed.ok) return done(this.formatter.optionError(parsed.error, 'ping'))
        return this.probe(engine, deviceId, parsed.settings.target, { kind: 'ping', settings: parsed.settings })
      }
      case 'tracert': {
        const parsed = CommandOptions.parse(args, TracertCommand.options)
        if (!parsed.ok) return done(this.formatter.optionError(parsed.error, 'tracert'))
        return this.probe(engine, deviceId, parsed.options.target, { kind: 'tracert' })
      }
      case 'nslookup': {
        const name = args[0]
        if (name === undefined) return done(this.formatter.usage('nslookup'))
        return this.inject(engine, { kind: 'dnsQuery', deviceId, name, useCache: false }, { kind: 'nslookup', deviceId, name })
      }
      case 'ssh':
      case 'telnet': {
        const parsed = RemoteCommands.parse(deviceId, command, args)
        if (!parsed.ok) return done(parsed.lines)
        return this.inject(engine, parsed.request, { kind: 'remote', deviceId })
      }
      default:
        return this.arp(engine, deviceId, args)
    }
  }

  private ipconfig(engine: SimulationEngine, deviceId: string, args: string[]): SimCommandStart {
    const option = args[0]?.toLowerCase()
    const { formatter } = this
    if (args.length > 1) return done(formatter.ipconfigBadOption())
    if (option === undefined || option === '/all') return done(formatter.adapters(SimHostViews.adapters(engine, deviceId), option === '/all'))
    if (option === '/renew') return this.inject(engine, { kind: 'dhcpRenew', deviceId }, { kind: 'dhcp', deviceId })
    if (option === '/release') return this.inject(engine, { kind: 'dhcpRelease', deviceId }, { kind: 'dhcp', deviceId })
    return done(formatter.ipconfigBadOption())
  }

  /** `arp -a [ip]` / `-g` reads the cache; `arp -d [*]` clears it (Windows prints nothing). */
  private arp(engine: SimulationEngine, deviceId: string, args: string[]): SimCommandStart {
    const [option, target, ...rest] = args
    const flag = option?.toLowerCase().replace(/^\//, '-')
    if (rest.length === 0 && (flag === '-a' || flag === '-g') && (target === undefined || Ipv4.isValid(target))) {
      return done(this.arpFormatter.table(SimHostViews.arpTable(engine, deviceId, target)))
    }
    if (rest.length === 0 && flag === '-d' && (target === undefined || target === '*')) {
      return this.inject(engine, { kind: 'clearTable', deviceId, table: 'arp' }, { kind: 'arpClear', deviceId })
    }
    return done(this.arpFormatter.usage())
  }

  /** ping / tracert: an address is used as is; anything else is looked up first (the engine's ProbeReports.target). */
  private probe(engine: SimulationEngine, deviceId: string, target: string, command: ProbeCommand): SimCommandStart {
    if (Ipv4.isValid(target)) return this.sendProbe(engine, deviceId, target, null, command)
    return this.inject(engine, { kind: 'dnsQuery', deviceId, name: target, useCache: true }, { kind: 'lookup', deviceId, name: target, then: command })
  }

  private sendProbe(engine: SimulationEngine, deviceId: string, targetIp: string, name: string | null, command: ProbeCommand): SimCommandStart {
    const request: SimRequest =
      command.kind === 'ping'
        ? { kind: 'ping', deviceId, targetIp, count: command.settings.count, size: command.settings.size }
        : {
            kind: 'tracert',
            deviceId,
            targetIp,
            maxHops: TracertFormatter.maxHops,
            probesPerHop: TRACERT_PROBES,
            maxSilentHops: TracertFormatter.maxTimeoutLines,
          }
    const { counters } = engine.snapshot()
    const stage: CommandStage = { kind: 'probe', deviceId, targetIp, name, command, fromEventId: counters.event, fromTransmissionId: counters.transmission }
    return this.inject(engine, request, stage)
  }

  private inject(engine: SimulationEngine, request: SimRequest, stage: CommandStage): SimCommandStart {
    const requestId = engine.inject(request)
    this.stagesOf(engine).set(requestId, stage)
    return { kind: 'pending', requestId }
  }

  // ------------------------------------------------------------ results

  /** Maps the (done, or given up on) request; a finished lookup queues the probe. */
  private finish(engine: SimulationEngine, requestId: string): SimCommandStart {
    const record = engine.request(requestId)
    if (!record) throw new Error(`Unknown request: ${requestId}`)
    const stages = this.stagesOf(engine)
    const known = stages.get(requestId)
    const stage = known?.deviceId === record.request.deviceId ? known : CommandStages.fromRecord(record)
    stages.delete(requestId)
    if (record.aborted) return { kind: 'done', outcome: this.outcomes.aborted() }
    switch (stage.kind) {
      case 'lookup': {
        const answer = record.result?.kind === 'dns' ? record.result.answer : null
        if (!answer?.ok) return { kind: 'done', outcome: this.outcomes.hostNotFound(stage.deviceId, stage.name, stage.then) }
        return this.sendProbe(engine, stage.deviceId, answer.ip, stage.name, stage.then)
      }
      case 'probe':
        return { kind: 'done', outcome: this.outcomes.probe(engine, stage, record) }
      case 'nslookup':
        return { kind: 'done', outcome: this.outcomes.nslookup(stage.name, record) }
      case 'dhcp':
        return { kind: 'done', outcome: this.outcomes.dhcp(engine, stage.deviceId, record) }
      case 'arpClear':
        return done([])
      case 'remote':
        return done(RemoteCommands.outcome(engine.network(), record))
    }
  }

  private stagesOf(engine: SimulationEngine): Map<string, CommandStage> {
    let stages = this.stages.get(engine)
    if (!stages) {
      stages = new Map()
      this.stages.set(engine, stages)
    }
    return stages
  }

  private handlesOf(engine: SimulationEngine): Map<string, string> {
    let handles = this.handles.get(engine)
    if (!handles) {
      handles = new Map()
      this.handles.set(engine, handles)
    }
    return handles
  }
}
