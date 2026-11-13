// The device catalog: every model the workspace palette offers (docs/MODEL_V2.md §7).
import type { DeviceCategory, DeviceModel, DeviceSubcategory } from '../domain'
import { cloudModels } from './models/cloud'
import type { CatalogDeviceModel } from './models/defineModel'
import { endDeviceModels } from './models/endDevices'
import { routerModels } from './models/routers'
import { securityModels } from './models/security'
import { serverModels } from './models/servers'
import { switchModels } from './models/switches'
import { wirelessModels } from './models/wireless'

/** Palette order of the categories. */
export const DEVICE_CATEGORIES: readonly DeviceCategory[] = ['routers', 'switches', 'wireless', 'endDevices', 'servers', 'wan']

/** Every model, in palette order. Model ids are never renamed (stored in Device.modelId). */
export const deviceCatalog: readonly CatalogDeviceModel[] = [
  ...routerModels,
  ...securityModels,
  ...switchModels,
  ...wirelessModels,
  ...endDeviceModels,
  ...serverModels,
  ...cloudModels,
]

export class DeviceCatalog {
  readonly models: readonly CatalogDeviceModel[]
  private readonly byId: ReadonlyMap<string, CatalogDeviceModel>

  constructor(models: readonly CatalogDeviceModel[]) {
    this.models = models
    this.byId = new Map(models.map((model) => [model.id, model]))
  }

  find(id: string): CatalogDeviceModel | undefined {
    return this.byId.get(id)
  }

  /** Models of one palette category, in catalog order. */
  inCategory(category: DeviceCategory): CatalogDeviceModel[] {
    return this.models.filter((model) => model.category === category)
  }

  /** Models of one palette sub-category, in catalog order. */
  inSubcategory(subcategory: DeviceSubcategory): CatalogDeviceModel[] {
    return this.models.filter((model) => model.subcategory === subcategory)
  }
}

const defaultCatalog = new DeviceCatalog(deviceCatalog)

export function findDeviceModel(id: string): CatalogDeviceModel | undefined {
  return defaultCatalog.find(id)
}

export function modelsInCategory(category: DeviceCategory): CatalogDeviceModel[] {
  return defaultCatalog.inCategory(category)
}

/** i18n key of the model's one-line description (`catalog:models.<id>.description`). */
export function modelDescriptionKey(model: DeviceModel): string {
  return `catalog:models.${model.id}.description`
}
