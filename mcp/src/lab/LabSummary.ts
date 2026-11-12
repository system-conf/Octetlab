// get_lab: the lab as data the model can read (title, description, notes, devices with their ports'
// addressing, cable state and service / wireless settings, cables, canvas positions, annotations) plus
// a short text version.
import type { Annotation, Device, LabDocument, Link, Port } from '../../../src/domain'
import { type DeviceSettingsViewData, DeviceSettingsView } from './DeviceSettingsView'

/** Notes characters shown in get_lab's text (the structured result has all of them). */
const NOTES_TEXT_LIMIT = 1000

export interface PortView {
  id: string
  medium: string
  role: string
  /** shutdown · no cable · cable unplugged · connected */
  status: string
  connectedTo?: string
  ip?: string
  vlan?: string
}

export interface DeviceView {
  id: string
  name: string
  modelId: string
  kind: string
  powered: boolean
  position?: { x: number; y: number }
  gateway?: string
  dnsServers?: string[]
  ports: PortView[]
  settings: DeviceSettingsViewData
}

export interface LinkView {
  id: string
  a: string
  b: string
  cable: string
  connected: boolean
}

export interface LabView {
  title: string
  description: string
  notes: string
  devices: DeviceView[]
  links: LinkView[]
  annotations: Annotation[]
}

function endText(end: Link['a']): string {
  return `${end.deviceId} ${end.portId}`
}

function annotationText(annotation: Annotation): string {
  const where = annotation.type === 'line' ? `(${annotation.from.x},${annotation.from.y})→(${annotation.to.x},${annotation.to.y})` : `at (${annotation.at.x},${annotation.at.y})`
  const size = annotation.type === 'rectangle' || annotation.type === 'ellipse' ? ` ${annotation.width}×${annotation.height}` : ''
  const words = annotation.type === 'text' ? ` "${annotation.text}"` : annotation.type === 'line' || annotation.label === undefined ? '' : ` "${annotation.label}"`
  return `- ${annotation.id}: ${annotation.type} ${where}${size} ${annotation.color}${words}`
}

export class LabSummary {
  private readonly settings = new DeviceSettingsView()

  view(doc: LabDocument): LabView {
    return {
      title: doc.meta.title,
      description: doc.meta.description ?? '',
      notes: doc.notes,
      devices: doc.state.devices.map((device) => this.deviceView(doc, device)),
      links: doc.state.links.map((link) => ({ id: link.id, a: endText(link.a), b: endText(link.b), cable: link.cable, connected: link.connected })),
      annotations: doc.annotations,
    }
  }

  /** Readable outline: one line per device (cabled ports only, then its service settings), cable and annotation. */
  text(view: LabView): string {
    const devices = view.devices.flatMap((device) => {
      const used = device.ports.filter((port) => port.connectedTo !== undefined || port.ip !== undefined)
      const ports = used.map((port) => `${port.id}${port.ip === undefined ? '' : ` ${port.ip}`}${port.vlan === undefined ? '' : ` ${port.vlan}`} [${port.status}]${port.connectedTo === undefined ? '' : ` → ${port.connectedTo}`}`)
      const host = device.gateway === undefined ? '' : ` gw ${device.gateway || '-'} dns ${device.dnsServers?.join(',') || '-'}`
      return [`- ${device.id} "${device.name}" ${device.modelId}${device.powered ? '' : ' (off)'}${host}${ports.length === 0 ? '' : `: ${ports.join('; ')}`}`, ...this.settings.text(device.settings)]
    })
    const links = view.links.map((link) => `- ${link.id}: ${link.a} ↔ ${link.b} (${link.cable}${link.connected ? '' : ', unplugged'})`)
    const notes = view.notes.length > NOTES_TEXT_LIMIT ? `${view.notes.slice(0, NOTES_TEXT_LIMIT)}… (${view.notes.length} characters; all in structuredContent.notes)` : view.notes
    return [
      `Lab "${view.title}": ${view.devices.length} devices, ${view.links.length} cables, ${view.annotations.length} annotations`,
      ...(view.description === '' ? [] : [`Description: ${view.description}`]),
      ...devices,
      'Cables:',
      ...(links.length === 0 ? ['- (none)'] : links),
      ...(view.annotations.length === 0 ? [] : ['Annotations:', ...view.annotations.map(annotationText)]),
      ...(notes === '' ? [] : ['Notes:', notes]),
    ].join('\n')
  }

  private deviceView(doc: LabDocument, device: Device): DeviceView {
    const position = Object.hasOwn(doc.layout.devices, device.id) ? doc.layout.devices[device.id] : undefined
    return {
      id: device.id,
      name: device.name,
      modelId: device.modelId,
      kind: device.kind,
      powered: device.powered,
      ...(position === undefined ? {} : { position: { x: position.x, y: position.y } }),
      ...(device.host === undefined ? {} : { gateway: device.host.defaultGateway, dnsServers: [...device.host.dnsServers] }),
      ports: device.ports.map((port) => this.portView(doc, device, port)),
      settings: this.settings.view(device),
    }
  }

  private portView(doc: LabDocument, device: Device, port: Port): PortView {
    const link = doc.state.links.find((candidate) => endText(candidate.a) === `${device.id} ${port.id}` || endText(candidate.b) === `${device.id} ${port.id}`)
    const peer = link === undefined ? undefined : link.a.deviceId === device.id && link.a.portId === port.id ? link.b : link.a
    const status = !port.adminUp ? 'shutdown' : link === undefined ? 'no cable' : link.connected ? 'connected' : 'cable unplugged'
    return {
      id: port.id,
      medium: port.medium,
      role: port.role,
      status,
      ...(peer === undefined ? {} : { connectedTo: endText(peer) }),
      ...this.addressing(port),
    }
  }

  private addressing(port: Port): { ip?: string; vlan?: string } {
    switch (port.role) {
      case 'host':
      case 'routed': {
        const { addressing, address, mask } = port.l3.ipv4
        if (address === '') return addressing === 'dhcp' ? { ip: 'dhcp (no lease)' } : {}
        return { ip: `${address}/${mask}${addressing === 'dhcp' ? ' (dhcp)' : ''}` }
      }
      case 'switched':
        return { vlan: port.l2.mode === 'access' ? `access vlan ${port.l2.accessVlan}` : `trunk native ${port.l2.nativeVlan}` }
      case 'radio':
      case 'console':
      case 'passive':
        return {}
    }
  }
}
