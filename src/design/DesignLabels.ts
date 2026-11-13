import type { CableType, DeviceKind, DeviceModel, Link, NetworkState } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'

/** Infrastructure first, then end devices: the order of "devices by type" lists. */
const KIND_ORDER: Record<DeviceKind, number> = {
  internet: 0,
  firewall: 1,
  router: 2,
  wirelessRouter: 3,
  l3Switch: 4,
  switch: 5,
  hub: 6,
  accessPoint: 7,
  server: 8,
  nvr: 9,
  pc: 10,
  laptop: 11,
  printer: 12,
  ipPhone: 13,
  pos: 14,
  kitchenDisplay: 15,
  camera: 16,
  smartphone: 17,
  tablet: 18,
}

/** Shared labels and names of the review and the handover pack (texts of other namespaces are read, not owned). */
export class DesignLabels {
  static kind(kind: DeviceKind): LocalizedMessage {
    return localizedMessage(`catalog:kinds.${kind}`)
  }

  static cable(cable: CableType): LocalizedMessage {
    return localizedMessage(`workspace:cableTools.${cable}`)
  }

  /** Catalog name of a model; unknown models (removed from the catalog) show their id. */
  static model(modelId: string, findModel: (modelId: string) => DeviceModel | undefined): LocalizedMessage | string {
    const model = findModel(modelId)
    return model ? { key: model.nameKey } : modelId
  }

  static compareKinds(a: DeviceKind, b: DeviceKind): number {
    return KIND_ORDER[a] - KIND_ORDER[b]
  }

  /** Display name of a device; falls back to the id so a text is never empty. */
  static deviceName(state: NetworkState, deviceId: string): string {
    return state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  }

  /** Names of both ends of a link (ids when the link or a device is gone). */
  static linkEnds(state: NetworkState, linkId: string): { a: string; b: string } {
    const link: Link | undefined = state.links.find((candidate) => candidate.id === linkId)
    if (!link) return { a: linkId, b: linkId }
    return { a: DesignLabels.deviceName(state, link.a.deviceId), b: DesignLabels.deviceName(state, link.b.deviceId) }
  }
}
