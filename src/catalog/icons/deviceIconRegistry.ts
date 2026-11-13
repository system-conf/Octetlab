// Which icon a device shows: its model's own icon if it has one, else its kind's, else the
// generic fallback (model → kind → fallback).
import type { DeviceKind } from '../../domain'
import type { DeviceIconId } from './deviceIconTypes'

/** Icon of every device kind. */
export const deviceIconRegistry: Readonly<Record<DeviceKind, DeviceIconId>> = {
  internet: 'internetCloud',
  router: 'router',
  wirelessRouter: 'wirelessRouter',
  switch: 'switch',
  l3Switch: 'l3Switch',
  hub: 'hub',
  accessPoint: 'accessPoint',
  pc: 'pc',
  laptop: 'laptop',
  server: 'towerServer',
  printer: 'printer',
  ipPhone: 'ipPhone',
  pos: 'pos',
  camera: 'ipCamera',
  nvr: 'nvr',
  kitchenDisplay: 'kitchenDisplay',
  smartphone: 'smartphone',
  tablet: 'tablet',
  firewall: 'firewall',
}

/**
 * Catalog models whose icon differs from their kind's: the ISP modems are 'wirelessRouter' kind
 * devices, the smart TV a 'kitchenDisplay', the rack server a 'server', the multifunction printer a
 * 'printer'.
 */
export const modelIconOverrides: Readonly<Record<string, DeviceIconId>> = {
  dslModem: 'dslModem',
  cableModem: 'cableModem',
  rackServer: 'rackServer',
  multifunctionPrinter: 'multifunctionPrinter',
  smartTv: 'smartTv',
}

/** Shown for a kind without an icon (only possible with data from outside the type system). */
export const FALLBACK_DEVICE_ICON: DeviceIconId = 'genericDevice'

/** Icon id of a device kind (the fallback for an unknown kind). */
export function deviceIconFor(kind: DeviceKind): DeviceIconId {
  return Object.hasOwn(deviceIconRegistry, kind) ? deviceIconRegistry[kind] : FALLBACK_DEVICE_ICON
}

/** Icon id of a device of `kind` created from catalog model `modelId`: model → kind → fallback. */
export function deviceIconForModel(kind: DeviceKind, modelId: string | undefined): DeviceIconId {
  if (modelId !== undefined && Object.hasOwn(modelIconOverrides, modelId)) {
    const own = modelIconOverrides[modelId]
    if (own !== undefined) return own
  }
  return deviceIconFor(kind)
}
