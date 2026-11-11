import { describe, expect, it } from 'vitest'
import { deviceCatalog, sectionOfModel, subcategoriesWithModels } from '../labServices'
import { PaletteContents, type PaletteContentsQuery } from './PaletteContents'

const contents = new PaletteContents(deviceCatalog)
const base: PaletteContentsQuery = { view: 'network', subcategory: 'all', searchResults: null, favourites: [], recent: [] }
const ids = (query: Partial<PaletteContentsQuery>) => contents.groups({ ...base, ...query }).flatMap((group) => group.models.map((model) => model.id))

describe('PaletteContents', () => {
  it('lists the sections with models, then cables, favourites and recent', () => {
    const views = contents.views()
    expect(views.slice(-3)).toEqual(['cables', 'favourites', 'recent'])
    expect(views[0]).toBe('network')
  })

  it('groups a section by sub-category, each group named by its sub-category', () => {
    const groups = contents.groups(base)
    expect(groups.map((group) => group.subcategory)).toEqual(subcategoriesWithModels('network', deviceCatalog))
    for (const group of groups) {
      expect(group.models.length).toBeGreaterThan(0)
      for (const model of group.models) {
        expect(sectionOfModel(model)).toBe('network')
        expect(model.subcategory).toBe(group.subcategory)
      }
    }
  })

  it('shows one unnamed group for a chosen sub-category', () => {
    const subcategory = contents.subcategories('network')[0]
    if (subcategory === undefined) throw new Error('the catalog has network sub-categories')
    const groups = contents.groups({ ...base, subcategory })
    expect(groups).toHaveLength(1)
    expect(groups[0]?.subcategory).toBeUndefined()
    expect(groups[0]?.models.every((model) => model.subcategory === subcategory)).toBe(true)
  })

  it('keeps the order of search results, favourites and recent; skips unknown ids', () => {
    const [first, second] = deviceCatalog
    if (first === undefined || second === undefined) throw new Error('the catalog has models')
    expect(ids({ searchResults: [second.id, 'gone', first.id] })).toEqual([second.id, first.id])
    expect(ids({ view: 'favourites', favourites: [second.id, first.id] })).toEqual([second.id, first.id])
    expect(ids({ view: 'recent', recent: ['gone', first.id] })).toEqual([first.id])
    // A search wins over the current view.
    expect(ids({ view: 'recent', recent: [first.id], searchResults: [second.id] })).toEqual([second.id])
  })

  it('has no tiles and no sub-categories in the cables view', () => {
    expect(contents.groups({ ...base, view: 'cables' })).toEqual([])
    expect(contents.subcategories('cables')).toEqual([])
  })

  it('counts the tiles and finds models by id', () => {
    expect(PaletteContents.count(contents.groups(base))).toBe(deviceCatalog.filter((model) => sectionOfModel(model) === 'network').length)
    expect(contents.model('gone')).toBeNull()
    const first = deviceCatalog[0]
    if (first !== undefined) expect(contents.model(first.id)).toBe(first)
  })
})
