// The workspace's only door to the neighbouring modules (lab core, catalog, engine, exercise locks).
// Components and hooks import from here, so an API change of a neighbour touches one file.
import type { AppLinkStatus, Device, LinkLight, NetworkState } from '../../domain'
import { networkEngine, TerminalAvailability } from '../../engine'

export {
  createEmptyLab,
  deleteRecentLab,
  exportLabFile,
  importLabFile,
  isLabStorageAvailable,
  LAB_LIMITS,
  LAB_FILE_ACCEPT,
  labEditor,
  labFileName,
  LabMessages,
  labShareLink,
  listRecentLabs,
  loadAutosave,
  markLabOpened,
  openRecentLab,
  saveLabAsNew,
  SharedLabInbox,
  useLabDocument,
  type DeviceMove,
  type LabDocumentState,
  type LabEditor,
  type LabParseResult,
} from '../../lab'
export { DEVICE_CATEGORIES, DefaultDeviceNames, DeviceKindIcon, DeviceVisual, deviceCatalog, useDeviceStyle, findDeviceModel, PortFactory } from '../../catalog'
export {
  modelDescriptionKey,
  PortSummary,
  sectionOfModel,
  sectionsWithModels,
  subcategoriesWithModels,
  type CatalogSection,
  type PortSummaryInfo,
} from '../../catalog'
export { ExerciseLockPolicy, type EditAccess } from '../../session/ExerciseLockPolicy'

/** Physical link light of a cable (engine: plugged, powered, admin up, SSID offered, pinouts…). */
export function linkLightOf(network: NetworkState, linkId: string): LinkLight {
  return networkEngine.linkLight(network, linkId)
}

/** Whether the device has a command prompt (computers, POS terminals, servers, NVRs). */
export function hasTerminal(device: Device): boolean {
  return TerminalAvailability.isAvailable(device)
}

/** Whether each application link of an end device works (green / red with the failure reason). */
export function appLinkStatusOf(network: NetworkState, deviceId: string): AppLinkStatus[] {
  return networkEngine.appLinkStatus(network, deviceId)
}
