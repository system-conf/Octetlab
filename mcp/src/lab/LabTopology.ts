// Devices and cables of a lab: add / remove devices, connect / disconnect, power. Every method takes
// the document and returns the changed one (LabEditor keeps it valid) plus what to tell the model.
import { PortFactory } from '../../../src/catalog/PortFactory'
import type { CanvasPoint, Device, LabDocument, Link } from '../../../src/domain'
import { labEditor } from '../../../src/lab/LabEditor'
import type { CatalogBrowser } from '../catalog/CatalogBrowser'
import { ToolError } from '../errors/ToolError'
import type { EnglishMessages } from '../text/EnglishMessages'
import type { DeviceAccess } from './DeviceAccess'
import type { DeviceNamer } from './DeviceNamer'
import type { LayoutPlanner } from './LayoutPlanner'
import { type CableChoice, PortPicker } from './PortPicker'

/**
 * Devices one lab may have here. Below LAB_LIMITS.devices (500): every run_command builds the packet
 * simulator of the whole lab inside one Worker request, so the lab must stay small enough for that.
 */
export const MAX_MCP_DEVICES = 100

export interface ConnectRequest {
  deviceA: string
  deviceB: string
  portA?: string
  portB?: string
  cable: CableChoice
  ssid?: string
}

export interface TopologyDeps {
  catalog: CatalogBrowser
  devices: DeviceAccess
  namer: DeviceNamer
  layout: LayoutPlanner
  messages: EnglishMessages
}

export class LabTopology {
  private readonly deps: TopologyDeps
  private readonly picker = new PortPicker()

  constructor(deps: TopologyDeps) {
    this.deps = deps
  }

  addDevice(doc: LabDocument, modelId: string, name?: string, position?: CanvasPoint): { doc: LabDocument; device: Device } {
    if (doc.state.devices.length >= MAX_MCP_DEVICES) {
      throw ToolError.limit(`This lab already has ${doc.state.devices.length} devices; the limit here is ${MAX_MCP_DEVICES}.`)
    }
    const model = this.deps.catalog.model(modelId)
    const id = labEditor.nextDeviceId(doc, model.kind)
    const device = PortFactory.createDevice(model, id, name ?? this.deps.namer.defaultName(model, doc.state))
    const next = labEditor.addDevice(doc, device, position ?? this.deps.layout.nextFree(doc.layout))
    return { doc: next, device }
  }

  removeDevice(doc: LabDocument, deviceId: string): { doc: LabDocument; removedLinks: string[] } {
    this.deps.devices.require(doc, deviceId)
    const removedLinks = doc.state.links.filter((link) => link.a.deviceId === deviceId || link.b.deviceId === deviceId).map((link) => link.id)
    return { doc: labEditor.removeDevices(doc, [deviceId]), removedLinks }
  }

  connect(doc: LabDocument, request: ConnectRequest): { doc: LabDocument; link: Link } {
    const deviceA = this.deps.devices.require(doc, request.deviceA)
    const deviceB = this.deps.devices.require(doc, request.deviceB)
    this.requirePort(deviceA, request.portA)
    this.requirePort(deviceB, request.portB)
    const planned = this.picker.plan(doc.state, deviceA, deviceB, request.cable, request.portA, request.portB)
    if (planned === null) {
      const freeA = this.picker.freePorts(doc.state, deviceA).map((port) => port.id).join(', ') || '(none)'
      const freeB = this.picker.freePorts(doc.state, deviceB).map((port) => port.id).join(', ') || '(none)'
      throw ToolError.refused(
        `No free, compatible ports to join ${deviceA.id} and ${deviceB.id} with ${request.cable === 'auto' ? 'any cable' : `a ${request.cable} cable`}. ` +
          `Free ports: ${deviceA.id}: ${freeA}; ${deviceB.id}: ${freeB}.`,
      )
    }
    const link: Link = { id: labEditor.nextLinkId(doc), a: planned.a, b: planned.b, connected: true, ...this.picker.settingsFor(planned.cable, deviceA, deviceB, request.ssid) }
    const result = labEditor.connect(doc, link)
    if (!result.ok) {
      const reason = this.deps.messages.text(`workspace:cableRefusal.${result.refusal}`) ?? result.refusal
      const side = result.side === undefined ? '' : ` (end ${result.side === 'a' ? `${link.a.deviceId} ${link.a.portId}` : `${link.b.deviceId} ${link.b.portId}`})`
      throw ToolError.refused(`Cable refused${side}: ${reason}`)
    }
    return { doc: result.doc, link }
  }

  disconnect(doc: LabDocument, linkId: string): LabDocument {
    if (!doc.state.links.some((link) => link.id === linkId)) {
      const known = doc.state.links.map((link) => link.id).join(', ')
      throw ToolError.notFound(`Cable "${linkId}" is not in this lab. Cables: ${known === '' ? '(none)' : known}.`)
    }
    return labEditor.disconnect(doc, linkId)
  }

  setPower(doc: LabDocument, deviceId: string, powered: boolean): LabDocument {
    const device = this.deps.devices.require(doc, deviceId)
    return device.powered === powered ? doc : this.deps.devices.update(doc, { ...device, powered })
  }

  private requirePort(device: Device, portId: string | undefined): void {
    if (portId === undefined || device.ports.some((port) => port.id === portId)) return
    throw ToolError.notFound(`${device.id} has no port "${portId}". Ports: ${device.ports.map((port) => port.id).join(', ')}.`)
  }
}
