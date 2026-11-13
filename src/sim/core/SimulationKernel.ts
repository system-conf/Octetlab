import type { NetworkState } from '../../domain'
import { Topology } from '../../net/Topology'
import {
  type DeviceRuntime,
  type QueuedTask,
  type ReconfigureReport,
  type RequestRecord,
  type RunResult,
  SIM_LIMITS,
  type SimEvent,
  type SimLayers,
  type SimOptions,
  type SimRequest,
  type SimSnapshot,
  type SimTask,
  type SimTransmission,
  type SimulationEngine,
  type StateEffect,
  type StepGranularity,
  type StepResult,
} from '../contract'
import { DefaultLatencyModel } from './DefaultLatencyModel'
import { DeviceChanges } from './DeviceChanges'
import { KernelState } from './KernelState'
import { RetainedLog } from './RetainedLog'
import { RuntimeTables } from './RuntimeTables'
import { type ScopeBase, type ScopeDependencies, type ScopeResult, TaskScope } from './TaskScope'

/** Events and transmissions produced while a call runs (not kept while settling: nobody reads them). */
class Produced {
  readonly events: SimEvent[] = []
  readonly transmissions: SimTransmission[] = []
  tasks = 0
  private readonly collect: boolean

  constructor(collect = true) {
    this.collect = collect
  }

  add(events: readonly SimEvent[], transmissions: readonly SimTransmission[]): void {
    if (!this.collect) return
    for (const event of events) this.events.push(event)
    for (const transmission of transmissions) this.transmissions.push(transmission)
  }
}

/**
 * The engine shell (docs/SIMULATION.md §5, §6): virtual clock, event queue, seeded RNG, request
 * records, logs, reconfiguration and dispatch of every task to the layer that owns it. It knows no
 * protocol; the layers (S1–S3) do all the networking. A task costs what it touches: the live state is
 * mutable (KernelState), snapshots are built on demand.
 */
export class SimulationKernel implements SimulationEngine {
  private state: KernelState
  private readonly eventLog: RetainedLog<SimEvent>
  private readonly transmissionLog: RetainedLog<SimTransmission>
  private readonly deps: ScopeDependencies
  /** While settling the logs are not written (create clears them afterwards anyway). */
  private quiet = false
  private truncated = false

  private constructor(layers: SimLayers, options: SimOptions) {
    this.deps = { layers, latency: options.latency ?? new DefaultLatencyModel() }
    const maxRetained = options.maxRetainedEvents ?? SIM_LIMITS.maxRetainedEvents
    this.eventLog = new RetainedLog(maxRetained)
    this.transmissionLog = new RetainedLog(maxRetained)
    this.state = KernelState.initial(options.seed ?? 1)
  }

  /** Starts every powered device of `network`; with `settle` (default) runs the start-up traffic within its budget and clears the logs. */
  static create(network: NetworkState, layers: SimLayers, options: SimOptions = {}): SimulationKernel {
    const kernel = new SimulationKernel(layers, options)
    kernel.reconfigure(network)
    if (options.settle ?? true) kernel.settle(options.settleBudget)
    return kernel
  }

  get time(): number {
    return this.state.time
  }

  get settleTruncated(): boolean {
    return this.truncated
  }

  network(): NetworkState {
    return this.state.network
  }

  runtime(deviceId: string): DeviceRuntime | undefined {
    return this.state.devices[deviceId]
  }

  request(requestId: string): RequestRecord | undefined {
    return this.state.requests[requestId]
  }

  requests(): readonly RequestRecord[] {
    return Object.values(this.state.requests)
  }

  isIdle(): boolean {
    return this.state.queueSize === 0
  }

  nextTaskTime(): number | null {
    return this.state.peek()?.time ?? null
  }

  snapshot(): SimSnapshot {
    return this.state.snapshot()
  }

  restore(snapshot: SimSnapshot): void {
    this.state = KernelState.restored(snapshot)
    this.eventLog.truncate(snapshot.counters.event)
    this.transmissionLog.truncate(snapshot.counters.transmission)
  }

  events(fromId = 0): readonly SimEvent[] {
    return this.eventLog.from(fromId)
  }

  transmissions(fromId = 0): readonly SimTransmission[] {
    return this.transmissionLog.from(fromId)
  }

  inject(request: SimRequest, delayMs = 0): string {
    if (!Topology.of(this.state.network).find(request.deviceId)) throw new Error(`Unknown device id: ${request.deviceId}`)
    if (!(delayMs >= 0)) throw new Error(`Negative request delay: ${delayMs}`)
    const { counters, time } = this.state
    const id = `r${counters.request}`
    const record: RequestRecord = { id, request, status: 'queued', queuedAt: time, finishedAt: null, result: null }
    const task: QueuedTask = { time: time + delayMs, seq: counters.seq, task: { kind: 'request', deviceId: request.deviceId, requestId: id } }
    this.state.setCounters({ ...counters, request: counters.request + 1, seq: counters.seq + 1 })
    this.state.addRequest(record, task)
    return id
  }

  step(granularity: StepGranularity = 'instant'): StepResult {
    const produced = new Produced()
    const head = this.state.peek()
    if (head) {
      if (granularity === 'task') this.processNext(produced)
      else this.runWhile(produced, SIM_LIMITS.taskLimit, (next) => next.time === head.time)
    }
    return this.result(produced)
  }

  runUntilIdle(taskLimit: number = SIM_LIMITS.taskLimit): RunResult {
    const produced = new Produced()
    this.runWhile(produced, taskLimit, () => true)
    return { ...this.result(produced), stoppedBy: this.isIdle() ? 'idle' : 'limit' }
  }

  runUntil(time: number, taskLimit: number = SIM_LIMITS.taskLimit): RunResult {
    const produced = new Produced()
    this.runWhile(produced, taskLimit, (next) => next.time <= time)
    const limited = produced.tasks >= taskLimit && (this.nextTaskTime() ?? Infinity) <= time
    if (!limited && time > this.state.time) this.state.setTime(time)
    return { ...this.result(produced), stoppedBy: limited ? 'limit' : 'time' }
  }

  runUntilDone(requestId: string, taskLimit: number = SIM_LIMITS.taskLimit): RunResult {
    if (!this.state.requests[requestId]) throw new Error(`Unknown request: ${requestId}`)
    const produced = new Produced()
    const done = () => this.state.requests[requestId]?.status === 'done'
    this.runWhile(produced, taskLimit, () => !done())
    const stoppedBy = done() ? 'requestDone' : this.isIdle() ? 'idle' : 'limit'
    return { ...this.result(produced), stoppedBy }
  }

  reconfigure(next: NetworkState): ReconfigureReport {
    return this.changeNetwork(next, new Produced())
  }

  // ------------------------------------------------------------ internals

  /**
   * The start-up traffic, deterministic and bounded: tasks up to `timeMs` of virtual time, at most
   * `tasks` of them. What is left stays queued (`settleTruncated`). Then `LinkLayer.onSettled`, and
   * the logs start empty.
   */
  private settle(budget: SimOptions['settleBudget']): void {
    const until = this.state.time + (budget?.timeMs ?? SIM_LIMITS.settleTimeMs)
    this.quiet = true
    this.runWhile(new Produced(false), budget?.tasks ?? SIM_LIMITS.settleTaskLimit, (next) => next.time <= until)
    this.truncated = !this.isIdle()
    this.settled()
    this.quiet = false
    this.eventLog.clear()
    this.transmissionLog.clear()
  }

  /** `LinkLayer.onSettled` per running device, in state order, in one scope at the current time. */
  private settled(): void {
    const { link } = this.deps.layers
    if (!link.onSettled) return
    const scope = this.lifecycleScope(this.state.network)
    for (const device of this.state.network.devices) {
      if (scope.hasRuntime(device.id)) link.onSettled(scope.context(device.id, null))
    }
    this.commit(scope.commit(), new Produced(false))
  }

  /** A scope for lifecycle hooks at the current time; it takes the next sequence number. */
  private lifecycleScope(network: NetworkState): TaskScope {
    const { counters } = this.state
    const base = { ...this.scopeBase(), network, counters: { ...counters, seq: counters.seq + 1 } }
    return new TaskScope(base, counters.seq, this.deps)
  }

  private scopeBase(): ScopeBase {
    const { network, time, counters, rngState, devices, requests } = this.state
    return { network, time, counters, rngState, devices, requests }
  }

  private result(produced: Produced): StepResult {
    return {
      time: this.state.time,
      events: produced.events,
      transmissions: produced.transmissions,
      processedTasks: produced.tasks,
      idle: this.isIdle(),
    }
  }

  private runWhile(produced: Produced, taskLimit: number, accept: (next: QueuedTask) => boolean): void {
    for (let next = this.state.peek(); next && produced.tasks < taskLimit && accept(next); next = this.state.peek()) {
      this.processNext(produced)
    }
  }

  /** The head task runs in a scope over the live state; only a finished task is popped and applied. */
  private processNext(produced: Produced): void {
    const queued = this.state.peek()
    if (!queued) return
    const scope = new TaskScope({ ...this.scopeBase(), time: queued.time }, queued.seq, this.deps)
    this.dispatch(scope, queued.task)
    const committed = scope.commit()
    this.state.pop()
    this.state.setTime(queued.time)
    produced.tasks += 1
    this.commit(committed, produced)
  }

  private commit(committed: ScopeResult, produced: Produced): void {
    this.state.apply(committed)
    this.record(produced, committed.events, committed.transmissions)
    if (committed.effects.length > 0) this.applyEffects(committed.effects, produced)
  }

  private dispatch(scope: TaskScope, task: SimTask): void {
    switch (task.kind) {
      case 'arrival':
        return this.arrive(scope, task)
      case 'timer': {
        if (!scope.hasRuntime(task.deviceId)) return
        const ctx = scope.context(task.deviceId, null)
        const { layers } = this.deps
        const { timer } = task
        if (timer.layer === 'link') layers.link.onTimer(ctx, timer)
        else if (timer.layer === 'network') layers.network.onTimer(ctx, timer)
        else layers.services.onTimer(ctx, timer)
        return
      }
      case 'request':
        return this.startRequest(scope, task.deviceId, task.requestId)
    }
  }

  /** The frame enters the device unless its link went down (or was unplugged from that port) while it travelled. */
  private arrive(scope: TaskScope, task: Extract<SimTask, { kind: 'arrival' }>): void {
    const { arrival, deviceId } = task
    const recorder = scope.openEvent({
      deviceId,
      flowId: arrival.ids.flowId,
      pduId: arrival.ids.pduId,
      frameId: arrival.ids.frameId,
      inPortId: arrival.portId,
      inbound: arrival.frame,
      lastDeviceId: arrival.fromDeviceId,
      transmissionId: task.transmissionId,
    })
    const link = scope.topology.linksAt(deviceId, arrival.portId).find((candidate) => candidate.id === arrival.linkId)
    if (!link || !scope.topology.isUp(link) || !scope.hasRuntime(deviceId)) {
      recorder.conclude('dropped', 1, 'linkDown')
      return
    }
    this.deps.layers.link.onFrame(scope.context(deviceId, recorder), arrival)
  }

  private startRequest(scope: TaskScope, deviceId: string, requestId: string): void {
    const record = scope.request(requestId)
    if (!record || record.status === 'done') return
    if (!scope.hasRuntime(deviceId)) {
      scope.setRequest({ ...record, status: 'done', finishedAt: scope.time, aborted: 'deviceOff' })
      return
    }
    scope.setRequest({ ...record, status: 'running' })
    const ctx = scope.context(deviceId, null)
    const { request } = record
    const { layers } = this.deps
    switch (request.kind) {
      case 'ping':
      case 'tracert':
        return layers.network.onRequest(ctx, requestId, request)
      case 'clearTable':
        if (request.table === 'natTranslations' || request.table === 'aclCounters' || request.table === 'firewallConnections') {
          return layers.network.onRequest(ctx, requestId, request)
        }
        if (request.table !== 'dnsCache') return layers.link.onRequest(ctx, requestId, request)
        return layers.services.onRequest(ctx, requestId, request)
      default:
        return layers.services.onRequest(ctx, requestId, request)
    }
  }

  private applyEffects(effects: readonly StateEffect[], produced: Produced): void {
    let network = this.state.network
    for (const effect of effects) network = this.deps.layers.services.applyEffect(network, effect)
    this.changeNetwork(network, produced)
  }

  /** New configuration: stop, start and notify devices in one scope at the current time. */
  private changeNetwork(next: NetworkState, produced: Produced): ReconfigureReport {
    const plan = DeviceChanges.between(this.state.network, next)
    const scope = this.lifecycleScope(next)
    const abortedRequests: string[] = []
    for (const { deviceId, removed } of plan.stopped) {
      scope.setRuntime(deviceId, undefined)
      abortedRequests.push(...scope.abortRequests(deviceId, removed ? 'deviceRemoved' : 'deviceOff'))
    }
    const { layers } = this.deps
    for (const deviceId of plan.started) {
      scope.setRuntime(deviceId, RuntimeTables.empty(deviceId))
      const ctx = scope.context(deviceId, null)
      layers.link.onStart(ctx)
      layers.network.onStart(ctx)
      layers.services.onStart(ctx)
    }
    for (const { deviceId, change } of plan.changed) {
      const ctx = scope.context(deviceId, null)
      layers.link.onChange(ctx, change)
      layers.network.onChange(ctx, change)
      layers.services.onChange(ctx, change)
    }
    const committed = scope.commit()
    this.state.setNetwork(next)
    this.commit(committed, produced)
    return {
      changedDevices: plan.changed.map((entry) => entry.deviceId),
      startedDevices: [...plan.started],
      stoppedDevices: plan.stopped.map((entry) => entry.deviceId),
      abortedRequests,
      events: committed.events,
    }
  }

  private record(produced: Produced, events: readonly SimEvent[], transmissions: readonly SimTransmission[]): void {
    produced.add(events, transmissions)
    if (this.quiet) return
    this.eventLog.append(events)
    this.transmissionLog.append(transmissions)
  }
}
