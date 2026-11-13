import { describe, expect, it } from 'vitest'
import { V1_MODEL_IDS } from '../lab/migrations'
import { DEVICE_CATEGORIES, deviceCatalog, findDeviceModel, modelsInCategory } from './DeviceCatalog'
import { CATALOG_SECTIONS, DEVICE_SUBCATEGORIES, sectionOfModel, sectionsWithModels, subcategoriesWithModels } from './catalogSections'
import { PORT_GROUPS } from './portTemplates'

describe('deviceCatalog', () => {
  it('has unique model ids', () => {
    const ids = deviceCatalog.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains every model id the v1 migration produces', () => {
    for (const id of V1_MODEL_IDS) expect(findDeviceModel(id), id).toBeDefined()
  })

  it('finds models by id and returns undefined for unknown ids', () => {
    expect(findDeviceModel('router2Port')?.kind).toBe('router')
    expect(findDeviceModel('noSuchModel')).toBeUndefined()
  })

  it('puts every model in a known category and every category has models', () => {
    for (const model of deviceCatalog) expect(DEVICE_CATEGORIES).toContain(model.category)
    for (const category of DEVICE_CATEGORIES) expect(modelsInCategory(category).length, category).toBeGreaterThan(0)
  })

  it('uses the catalog namespace for every name and use-case key', () => {
    for (const model of deviceCatalog) {
      expect(model.nameKey).toBe(`catalog:models.${model.id}.name`)
      expect(model.useCaseKey).toBe(`catalog:models.${model.id}.useCase`)
    }
  })

  it('puts every model in a known sub-category and shows only sections with models', () => {
    for (const model of deviceCatalog) expect(DEVICE_SUBCATEGORIES, model.id).toContain(model.subcategory)
    expect(new Set(DEVICE_SUBCATEGORIES).size).toBe(DEVICE_SUBCATEGORIES.length)
    expect(CATALOG_SECTIONS).toEqual(['network', 'endDevices', 'iot', 'misc'])
    expect(sectionsWithModels(deviceCatalog)).toEqual(['network', 'endDevices'])
    expect(subcategoriesWithModels('network', deviceCatalog)).toEqual(['router', 'switch', 'hub', 'wireless', 'security', 'wanIsp'])
    expect(subcategoriesWithModels('endDevices', deviceCatalog)).toEqual([
      'pcLaptop',
      'server',
      'printer',
      'phoneTablet',
      'cameraNvr',
      'posDisplay',
    ])
  })

  it('keeps network gear and end devices in their sections', () => {
    for (const model of deviceCatalog) {
      const endDevice = model.ports.every((port) => port.role === 'host')
      expect(sectionOfModel(model), model.id).toBe(endDevice ? 'endDevices' : 'network')
    }
  })

  describe.each(deviceCatalog.map((model) => [model.id, model] as const))('%s', (_, model) => {
    it('has unique port ids', () => {
      const ids = model.ports.map((port) => port.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('has consistent port templates', () => {
      for (const port of model.ports) {
        expect(PORT_GROUPS).toContain(port.group)
        expect(port.role === 'console', port.id).toBe(port.medium === 'console')
        expect(port.role === 'radio' && port.medium !== 'wireless', port.id).toBe(false)
        expect([...port.speedsMbps].sort((first, second) => first - second)).toEqual([...port.speedsMbps])
        if (port.medium !== 'console' && port.medium !== 'serial') expect(port.speedsMbps.length, port.id).toBeGreaterThan(0)
      }
    })

    it('declares poe exactly when a port can source PoE', () => {
      expect(model.capabilities.includes('poe')).toBe(model.ports.some((port) => port.poe === true))
    })

    it('declares the capabilities its ports need', () => {
      const roles = new Set(model.ports.map((port) => port.role))
      if (roles.has('radio')) expect(model.capabilities).toContain('wireless')
      if (model.ports.some((port) => port.role === 'host' && port.medium === 'wireless')) {
        expect(model.capabilities).toContain('wirelessClient')
      }
      if (roles.has('switched') && model.kind !== 'accessPoint') expect(model.capabilities).toContain('l2Switching')
    })
  })
})
