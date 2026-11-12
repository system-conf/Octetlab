// configure_device: what the app's device window edits besides ports and IOS config — name, canvas
// position, SSIDs, DHCP / DNS server and the internet cloud's service lines (ISP outage). Each part is
// validated by the app's own form model and offered only where the app shows that card
// (DeviceSections); the changed device goes through LabEditor like a GUI save.
import { findDeviceModel } from '../../../src/catalog/DeviceCatalog'
import type { CanvasPoint, Device, LabDocument } from '../../../src/domain'
import { type ConfigSectionId, DeviceSections } from '../../../src/features/deviceConfig/model/DeviceSections'
import { GeneralFormModel } from '../../../src/features/deviceConfig/model/GeneralFormModel'
import { InternetServiceModel } from '../../../src/features/deviceConfig/model/InternetServiceModel'
import { SsidFormModel, type SsidDraft } from '../../../src/features/deviceConfig/model/SsidFormModel'
import { labEditor } from '../../../src/lab/LabEditor'
import { ToolError } from '../errors/ToolError'
import type { DeviceAccess } from './DeviceAccess'
import type { FieldProblems } from './FieldProblems'
import type { DhcpInput, DnsInput, ServiceSettingsEditor } from './ServiceSettingsEditor'

export interface SsidInput {
  ssid: string
  /** Default 1. */
  vlan?: number | undefined
  /** Only 'open' until the app's wireless security pack. */
  security?: 'open' | undefined
}

export interface ServiceLineInput {
  /** Port of the internet cloud. */
  portId: string
  /** false = provider outage on that line. */
  up: boolean
}

export interface DeviceSettingsRequest {
  deviceId: string
  name?: string | undefined
  position?: CanvasPoint | undefined
  /** Replaces the SSID list. */
  ssids?: SsidInput[] | undefined
  dhcp?: DhcpInput | undefined
  dns?: DnsInput | undefined
  /** Only the listed lines change. */
  internetService?: ServiceLineInput[] | undefined
}

export interface DeviceSettingsResult {
  doc: LabDocument
  device: Device
  /** What changed, in words: "name", "position", "SSIDs", "DHCP server", … */
  changes: string[]
}

const SECTION_HINT: Readonly<Partial<Record<ConfigSectionId, string>>> = {
  wireless: 'SSIDs exist only on access points and wireless routers',
  dhcp: 'a DHCP server runs only on routers, servers and wireless routers',
  dns: 'a DNS server runs only on routers, servers and wireless routers',
  internet: 'service lines exist only on the internet cloud',
}

export class DeviceSettingsEditor {
  private readonly devices: DeviceAccess
  private readonly services: ServiceSettingsEditor
  private readonly problems: FieldProblems

  constructor(devices: DeviceAccess, services: ServiceSettingsEditor, problems: FieldProblems) {
    this.devices = devices
    this.services = services
    this.problems = problems
  }

  configure(doc: LabDocument, request: DeviceSettingsRequest): DeviceSettingsResult {
    const device = this.devices.require(doc, request.deviceId)
    const sections = DeviceSections.of(device, findDeviceModel(device.modelId))
    const changes: string[] = []
    let next: Device = device
    if (request.name !== undefined) {
      this.problems.check(`The name of ${device.id}`, this.problems.one('name', GeneralFormModel.nameError(request.name)))
      next = { ...next, name: request.name.trim() }
      changes.push('name')
    }
    if (request.ssids !== undefined) {
      this.allowed(next, sections, 'wireless')
      next = { ...next, wireless: this.ssids(next, request.ssids) }
      changes.push('SSIDs')
    }
    if (request.dhcp !== undefined) {
      this.allowed(next, sections, 'dhcp')
      next = { ...next, services: { ...next.services, dhcp: this.services.dhcp(next.services?.dhcp, request.dhcp, device.id) } }
      changes.push('DHCP server')
    }
    if (request.dns !== undefined) {
      this.allowed(next, sections, 'dns')
      next = { ...next, services: { ...next.services, dns: this.services.dns(next.services?.dns, request.dns, device.id) } }
      changes.push('DNS server')
    }
    if (request.internetService !== undefined) {
      this.allowed(next, sections, 'internet')
      next = { ...next, internet: this.serviceLines(next, request.internetService) }
      changes.push('ISP service')
    }
    let result = JSON.stringify(next) === JSON.stringify(device) ? doc : this.devices.update(doc, next)
    if (request.position !== undefined) {
      result = labEditor.moveDevices(result, [{ id: device.id, to: request.position }])
      changes.push('position')
    }
    return { doc: result, device: next, changes }
  }

  /** A validation ToolError when the app shows no `section` card for this device. */
  private allowed(device: Device, sections: readonly ConfigSectionId[], section: ConfigSectionId): void {
    if (sections.includes(section)) return
    const hint = SECTION_HINT[section] ?? 'this device has no such settings'
    throw ToolError.validation(`${device.id} is a ${device.kind} (${device.modelId}): ${hint}.`)
  }

  private ssids(device: Device, input: readonly SsidInput[]): NonNullable<Device['wireless']> {
    const wireless = device.wireless ?? { ssids: [] }
    const drafts = input.map((ssid, index): SsidDraft => ({ key: `input${index}`, ssid: ssid.ssid, vlan: String(ssid.vlan ?? 1), security: ssid.security ?? 'open' }))
    this.problems.check('The SSIDs', this.problems.rows('ssids', SsidFormModel.validate(drafts)))
    return SsidFormModel.apply(drafts, wireless)
  }

  private serviceLines(device: Device, input: readonly ServiceLineInput[]): NonNullable<Device['internet']> {
    const lines = InternetServiceModel.serviceLines(device)
    const unknown = input.find((change) => !lines.some((line) => line.portId === change.portId))
    if (unknown !== undefined) {
      throw ToolError.notFound(`${device.id} has no port "${unknown.portId}". Ports: ${lines.map((line) => line.portId).join(', ') || '(none)'}.`)
    }
    const changed = lines.map((line) => {
      const change = input.findLast((candidate) => candidate.portId === line.portId)
      return change === undefined ? line : { ...line, serviceUp: change.up }
    })
    return InternetServiceModel.apply(changed, device)
  }
}
