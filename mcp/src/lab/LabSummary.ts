// get_lab: the lab as data the model can read (devices with their ports' addressing and cable state,
// cables, canvas positions) plus a short text version.
import type { Device, LabDocument, Link, Port } from '../../../src/domain'

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
  devices: DeviceView[]
  links: LinkView[]
}

function endText(end: Link['a']): string {
  return `${end.deviceId} ${end.portId}`
}

export class LabSummary {
  view(doc: LabDocument): LabView {
    return {
      title: doc.meta.title,
      devices: doc.state.devices.map((device) => this.deviceView(doc, device)),
      links: doc.state.links.map((link) => ({ id: link.id, a: endText(link.a), b: endText(link.b), cable: link.cable, connected: link.connected })),
    }
  }

  /** Readable outline: one line per device (cabled ports only) and per cable. */
  text(view: LabView): string {
    const devices = view.devices.map((device) => {
      const used = device.ports.filter((port) => port.connectedTo !== undefined || port.ip !== undefined)
      const ports = used.map((port) => `${port.id}${port.ip === undefined ? '' : ` ${port.ip}`}${port.vlan === undefined ? '' : ` ${port.vlan}`} [${port.status}]${port.connectedTo === undefined ? '' : ` → ${port.connectedTo}`}`)
      const host = device.gateway === undefined ? '' : ` gw ${device.gateway || '-'} dns ${device.dnsServers?.join(',') || '-'}`
      return `- ${device.id} "${device.name}" ${device.modelId}${device.powered ? '' : ' (off)'}${host}${ports.length === 0 ? '' : `: ${ports.join('; ')}`}`
    })
    const links = view.links.map((link) => `- ${link.id}: ${link.a} ↔ ${link.b} (${link.cable}${link.connected ? '' : ', unplugged'})`)
    return [`Lab "${view.title}": ${view.devices.length} devices, ${view.links.length} cables`, ...devices, 'Cables:', ...(links.length === 0 ? ['- (none)'] : links)].join('\n')
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
