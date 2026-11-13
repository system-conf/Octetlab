// Every catalog i18n key the code builds must exist in both bundled languages.
import { describe, expect, it } from 'vitest'
import type { DeviceKind, PortMedium, PortRole } from '../domain'
import en from '../locales/en/catalog.json'
import tr from '../locales/tr/catalog.json'
import { DEVICE_CATEGORIES, deviceCatalog, modelDescriptionKey } from './DeviceCatalog'
import { CATALOG_SECTIONS, DEVICE_SUBCATEGORIES } from './catalogSections'
import { deviceIconRegistry } from './icons/deviceIconRegistry'
import { PORT_GROUPS } from './portTemplates'
import { PortStrip } from './PortStrip'

const MEDIA: readonly PortMedium[] = ['copper', 'fiber', 'wireless', 'serial', 'console', 'coaxial']
const ROLES: readonly PortRole[] = ['switched', 'routed', 'host', 'radio', 'console', 'passive']
const KINDS = Object.keys(deviceIconRegistry) as DeviceKind[]

function lookup(resource: unknown, key: string): unknown {
  const [namespace, path] = key.split(':')
  if (namespace !== 'catalog' || path === undefined) return undefined
  return path.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined
    return (node as Record<string, unknown>)[segment]
  }, resource)
}

function expectText(resource: unknown, key: string): void {
  const value = lookup(resource, key)
  expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
}

describe.each([
  ['en', en],
  ['tr', tr],
] as const)('catalog locale %s', (_, resource) => {
  it('names and describes every model', () => {
    for (const model of deviceCatalog) {
      expectText(resource, model.nameKey)
      expectText(resource, modelDescriptionKey(model))
      expectText(resource, model.useCaseKey)
    }
  })

  it('names every category, section, sub-category, kind, medium and role', () => {
    for (const category of DEVICE_CATEGORIES) expectText(resource, `catalog:categories.${category}`)
    for (const section of CATALOG_SECTIONS) expectText(resource, `catalog:sections.${section}`)
    for (const subcategory of DEVICE_SUBCATEGORIES) expectText(resource, `catalog:subcategories.${subcategory}`)
    for (const kind of KINDS) expectText(resource, `catalog:kinds.${kind}`)
    for (const medium of MEDIA) expectText(resource, `catalog:media.${medium}`)
    for (const role of ROLES) expectText(resource, `catalog:portRoles.${role}`)
  })

  it('names and describes every port group and strip section', () => {
    for (const group of [...PORT_GROUPS, 'other']) {
      expectText(resource, `catalog:portGroups.${group}.name`)
      expectText(resource, `catalog:portGroups.${group}.description`)
    }
    for (const model of deviceCatalog) {
      for (const section of PortStrip.forModel(model).sections) expectText(resource, section.labelKey)
    }
  })
})

it('covers all 19 device kinds', () => {
  expect(KINDS).toHaveLength(19)
})
