// What the device palette lists for a view: groups of model tiles (shared by the sidebar and the
// bottom bar, so both show exactly the same devices).
import type { DeviceModel, DeviceSubcategory } from '../../../domain'
import { sectionOfModel, sectionsWithModels, subcategoriesWithModels } from '../labServices'
import { isCatalogSection, type PaletteView, type SubcategoryChoice } from './paletteViews'

export interface TileGroup {
  key: string
  /** Sub-category of the group when the section shows all of them (its heading); absent otherwise. */
  subcategory?: DeviceSubcategory
  models: readonly DeviceModel[]
}

export interface PaletteContentsQuery {
  view: PaletteView
  subcategory: SubcategoryChoice
  /** Model ids matching the search, in result order; null when nothing is searched. */
  searchResults: readonly string[] | null
  favourites: readonly string[]
  recent: readonly string[]
}

export class PaletteContents {
  private readonly models: readonly DeviceModel[]
  private readonly byId: ReadonlyMap<string, DeviceModel>

  constructor(models: readonly DeviceModel[]) {
    this.models = models
    this.byId = new Map(models.map((model) => [model.id, model]))
  }

  /** Section views that have models, then cables, favourites and recent. */
  views(): readonly PaletteView[] {
    return [...sectionsWithModels(this.models), 'cables', 'favourites', 'recent']
  }

  /** Sub-categories offered as a filter in a view (none outside the catalog sections). */
  subcategories(view: PaletteView): readonly DeviceSubcategory[] {
    return isCatalogSection(view) ? subcategoriesWithModels(view, this.models) : []
  }

  model(modelId: string): DeviceModel | null {
    return this.byId.get(modelId) ?? null
  }

  /** The tile groups of a view; empty for the cables view. */
  groups(query: PaletteContentsQuery): TileGroup[] {
    const { view, subcategory } = query
    if (query.searchResults !== null) return [{ key: 'results', models: this.modelsOf(query.searchResults) }]
    if (view === 'favourites') return [{ key: view, models: this.modelsOf(query.favourites) }]
    if (view === 'recent') return [{ key: view, models: this.modelsOf(query.recent) }]
    if (!isCatalogSection(view)) return []
    const inSection = this.models.filter((model) => sectionOfModel(model) === view)
    if (subcategory !== 'all') return [{ key: subcategory, models: inSection.filter((model) => model.subcategory === subcategory) }]
    return this.subcategories(view).map((choice) => ({
      key: choice,
      subcategory: choice,
      models: inSection.filter((model) => model.subcategory === choice),
    }))
  }

  static count(groups: readonly TileGroup[]): number {
    return groups.reduce((sum, group) => sum + group.models.length, 0)
  }

  private modelsOf(ids: readonly string[]): DeviceModel[] {
    return ids.flatMap((id) => this.byId.get(id) ?? [])
  }
}
