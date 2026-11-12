// build_lab (docs/LIVE_LABS.md §7): devices, then cables, then host settings, then IOS config, applied
// in order to one document. Every step runs even after a failure so that the result lists every failed
// step; the caller saves nothing when any step failed (all-or-nothing). A CLI step with rejected lines
// counts as failed. Devices are named in later steps by their `ref` or, in an existing lab, by id.
import type { CanvasPoint, Device, DeviceKind, LabDocument } from '../../../src/domain'
import type { CliConfigApplier } from '../cli/CliConfigApplier'
import { ToolError } from '../errors/ToolError'
import { type HostConfigurator, type HostSettingsInput, hostSettingsRequestOf } from './HostConfigurator'
import type { ConnectRequest, LabTopology } from './LabTopology'
import type { CableChoice } from './PortPicker'

export interface BuildDeviceStep {
  ref: string
  modelId: string
  name?: string | undefined
  x?: number | undefined
  y?: number | undefined
}

export interface BuildLinkStep {
  a: string
  b: string
  portA?: string | undefined
  portB?: string | undefined
  cable: CableChoice
  ssid?: string | undefined
}

export interface BuildHostStep extends HostSettingsInput {
  device: string
}

export interface BuildCliStep {
  device: string
  config: string
}

export interface BuildPlan {
  devices: BuildDeviceStep[]
  links: BuildLinkStep[]
  hosts: BuildHostStep[]
  cli: BuildCliStep[]
}

export type BuildSection = keyof BuildPlan

export interface BuildFailure {
  section: BuildSection
  index: number
  reason: string
}

export interface BuiltDevice {
  ref: string
  deviceId: string
  name: string
  modelId: string
}

export interface BuildResult {
  doc: LabDocument
  devices: BuiltDevice[]
  linkIds: string[]
  /** Devices whose host settings / IOS config were applied. */
  configuredHosts: string[]
  configuredDevices: string[]
  failures: BuildFailure[]
}

export interface LabBuilderDeps {
  topology: LabTopology
  hosts: HostConfigurator
  cliConfig: CliConfigApplier
}

const ROUTER_KINDS: readonly DeviceKind[] = ['router', 'wirelessRouter']
const SWITCH_KINDS: readonly DeviceKind[] = ['switch', 'l3Switch']

function counted(count: number, singular: string, pluralForm = `${singular}s`): string | null {
  return count === 0 ? null : `${count} ${count === 1 ? singular : pluralForm}`
}

export class LabBuilder {
  private readonly deps: LabBuilderDeps

  constructor(deps: LabBuilderDeps) {
    this.deps = deps
  }

  build(start: LabDocument, plan: BuildPlan): BuildResult {
    const result: BuildResult = { doc: start, devices: [], linkIds: [], configuredHosts: [], configuredDevices: [], failures: [] }
    const refs = new Map<string, string>()
    plan.devices.forEach((step, index) => this.step(result, 'devices', index, () => this.addDevice(result, refs, step)))
    plan.links.forEach((step, index) => this.step(result, 'links', index, () => this.connect(result, refs, step)))
    plan.hosts.forEach((step, index) => this.step(result, 'hosts', index, () => this.configureHost(result, refs, step)))
    plan.cli.forEach((step, index) => this.step(result, 'cli', index, () => this.applyCli(result, refs, step)))
    return result
  }

  /** "Built 9 devices, 8 cables, configured 5 hosts and 1 router." */
  summary(result: BuildResult): string {
    const kinds = result.configuredDevices.map((id) => result.doc.state.devices.find((device) => device.id === id)?.kind)
    const routers = kinds.filter((kind) => kind !== undefined && ROUTER_KINDS.includes(kind)).length
    const switches = kinds.filter((kind) => kind !== undefined && SWITCH_KINDS.includes(kind)).length
    const built = [counted(result.devices.length, 'device'), counted(result.linkIds.length, 'cable')].filter((part) => part !== null)
    const configured = [
      counted(result.configuredHosts.length, 'host'),
      counted(routers, 'router'),
      counted(switches, 'switch', 'switches'),
      counted(kinds.length - routers - switches, 'other device'),
    ].filter((part) => part !== null)
    const parts = [...(built.length === 0 ? [] : [`Built ${built[0]}`, ...built.slice(1)]), ...(configured.length === 0 ? [] : [`configured ${configured[0]}`, ...configured.slice(1)])]
    if (parts.length === 0) return 'Built nothing.'
    const sentence = parts.length === 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
  }

  /** Every failed step, one per line, for the model. */
  failureText(failures: readonly BuildFailure[]): string {
    return failures.map((failure) => `- ${failure.section}[${failure.index}]: ${failure.reason}`).join('\n')
  }

  private step(result: BuildResult, section: BuildSection, index: number, apply: () => void): void {
    try {
      apply()
    } catch (error) {
      if (!(error instanceof ToolError)) throw error
      result.failures.push({ section, index, reason: error.message })
    }
  }

  private addDevice(result: BuildResult, refs: Map<string, string>, step: BuildDeviceStep): void {
    if (refs.has(step.ref)) throw ToolError.validation(`ref "${step.ref}" is used by an earlier device; every device needs its own ref.`)
    const position: CanvasPoint | undefined = step.x === undefined || step.y === undefined ? undefined : { x: step.x, y: step.y }
    const added = this.deps.topology.addDevice(result.doc, step.modelId, step.name, position)
    result.doc = added.doc
    refs.set(step.ref, added.device.id)
    result.devices.push({ ref: step.ref, deviceId: added.device.id, name: added.device.name, modelId: added.device.modelId })
  }

  private connect(result: BuildResult, refs: ReadonlyMap<string, string>, step: BuildLinkStep): void {
    const request: ConnectRequest = {
      deviceA: this.resolve(result.doc, refs, step.a).id,
      deviceB: this.resolve(result.doc, refs, step.b).id,
      cable: step.cable,
      ...(step.portA === undefined ? {} : { portA: step.portA }),
      ...(step.portB === undefined ? {} : { portB: step.portB }),
      ...(step.ssid === undefined ? {} : { ssid: step.ssid }),
    }
    const connected = this.deps.topology.connect(result.doc, request)
    result.doc = connected.doc
    result.linkIds.push(connected.link.id)
  }

  private configureHost(result: BuildResult, refs: ReadonlyMap<string, string>, step: BuildHostStep): void {
    const device = this.resolve(result.doc, refs, step.device)
    const configured = this.deps.hosts.configure(result.doc, hostSettingsRequestOf(device.id, step))
    result.doc = configured.doc
    result.configuredHosts.push(device.id)
  }

  private applyCli(result: BuildResult, refs: ReadonlyMap<string, string>, step: BuildCliStep): void {
    const device = this.resolve(result.doc, refs, step.device)
    const applied = this.deps.cliConfig.apply(result.doc, device.id, step.config)
    if (applied.errors.length > 0) {
      const lines = applied.errors.map((error) => `"${error.line.trim()}" → ${error.error}`).join('; ')
      throw ToolError.validation(`${applied.errors.length} config line(s) rejected on ${device.id}: ${lines}`)
    }
    result.doc = applied.doc
    result.configuredDevices.push(device.id)
  }

  /** A device by its ref from devices[] or, failing that, by its id in the lab. */
  private resolve(doc: LabDocument, refs: ReadonlyMap<string, string>, name: string): Device {
    const id = refs.get(name) ?? name
    const device = doc.state.devices.find((candidate) => candidate.id === id)
    if (device !== undefined) return device
    const known = [...refs.keys()].join(', ') || '(none)'
    throw ToolError.notFound(`"${name}" is neither a ref from devices[] (refs: ${known}) nor a device id in this lab (or that device failed to be added).`)
  }
}
