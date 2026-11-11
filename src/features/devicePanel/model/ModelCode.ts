// Short model code printed on the front panel next to the OCTET brand, e.g. 'R3-G', 'S24-FE',
// 'S48P-FE'. Derived from the device kind and its ports, so new catalog models need no entry.
import type { Device, DeviceKind, DeviceModel, Port } from '../../../domain'

const KIND_PREFIX: Readonly<Record<DeviceKind, string>> = {
  internet: 'ISP',
  router: 'R',
  wirelessRouter: 'WR',
  switch: 'S',
  l3Switch: 'L3S',
  hub: 'H',
  accessPoint: 'AP',
  pc: 'PC',
  laptop: 'NB',
  server: 'SRV',
  printer: 'PRN',
  ipPhone: 'IPP',
  pos: 'POS',
  camera: 'CAM',
  nvr: 'NVR',
  kitchenDisplay: 'KDS',
  smartphone: 'SP',
  tablet: 'TAB',
}

/** Kinds whose code carries the number of network ports and their speed. */
const COUNTED_KINDS: ReadonlySet<DeviceKind> = new Set<DeviceKind>(['router', 'switch', 'l3Switch', 'hub', 'wirelessRouter'])

export class ModelCode {
  static of(device: Device, model: DeviceModel | undefined): string {
    const prefix = ModelCode.prefixOf(device)
    if (!COUNTED_KINDS.has(device.kind)) return prefix
    const wired = device.ports.filter((port) => port.medium === 'copper' || port.medium === 'fiber')
    // Switches count their access ports (uplinks are extra), routers every Ethernet interface.
    const counted = device.ports.some((port) => port.role === 'switched') && device.kind !== 'wirelessRouter'
      ? wired.filter((port) => ModelCode.groupOf(model, port) !== 'uplink')
      : wired
    const poe = device.ports.some((port) => port.poe !== undefined) ? 'P' : ''
    const serial = device.ports.some((port) => port.medium === 'serial') ? 'S' : ''
    const speed = ModelCode.speedOf(model, counted)
    return `${prefix}${counted.length}${poe}${serial}${speed === '' ? '' : `-${speed}`}`
  }

  private static prefixOf(device: Device): string {
    // ISP modems are home gateways (kind wirelessRouter); their line port names the technology.
    if (device.kind === 'wirelessRouter') {
      if (device.ports.some((port) => port.id === 'DSL')) return 'DSL'
      if (device.ports.some((port) => port.id === 'Cable')) return 'CM'
    }
    return KIND_PREFIX[device.kind]
  }

  private static groupOf(model: DeviceModel | undefined, port: Port): string | undefined {
    return model?.ports.find((template) => template.id === port.id)?.group
  }

  /** 'FE' when the counted ports top out at 100 Mbit/s, 'G' at 1 Gbit/s; '' when the model is unknown. */
  private static speedOf(model: DeviceModel | undefined, ports: readonly Port[]): string {
    const speeds = ports.flatMap((port) => model?.ports.find((template) => template.id === port.id)?.speedsMbps ?? [])
    if (speeds.length === 0) return ''
    const fastest = Math.max(...speeds)
    if (fastest >= 10000) return 'X'
    return fastest >= 1000 ? 'G' : 'FE'
  }
}
