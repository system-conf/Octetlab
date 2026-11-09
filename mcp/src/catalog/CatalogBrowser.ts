// Read-only views of Octetlab's device catalog and sample labs, with English names.
import { DEVICE_CATEGORIES, deviceCatalog, findDeviceModel } from '../../../src/catalog/DeviceCatalog'
import type { CatalogDeviceModel } from '../../../src/catalog/models/defineModel'
import type { DeviceCategory, LabDocument } from '../../../src/domain'
import { openSampleLab, SampleCatalog } from '../../../src/samples/contract/SampleCatalog'
import { SampleTextKeys } from '../../../src/samples/contract/SampleTextKeys'
import type { SampleDefinition } from '../../../src/samples/contract/SampleTypes'
import { sampleDefinitions } from '../../../src/samples/sampleDefinitions'
import { ToolError } from '../errors/ToolError'
import type { EnglishMessages } from '../text/EnglishMessages'
import { PortGroups } from './PortGroups'

export interface ModelInfo {
  modelId: string
  name: string
  kind: string
  category: DeviceCategory
  ports: string
  capabilities: readonly string[]
  useCase: string
}

export interface SampleInfo {
  sampleId: string
  category: string
  level: string
  title: string
  summary: string
}

export class CatalogBrowser {
  private readonly messages: EnglishMessages
  private readonly samples = new SampleCatalog(sampleDefinitions)

  constructor(messages: EnglishMessages) {
    this.messages = messages
  }

  static readonly categories: readonly DeviceCategory[] = DEVICE_CATEGORIES

  models(category?: DeviceCategory): ModelInfo[] {
    return deviceCatalog.filter((model) => category === undefined || model.category === category).map((model) => this.modelInfo(model))
  }

  /** The catalog model, or a ToolError naming list_device_models. */
  model(modelId: string): CatalogDeviceModel {
    const model = findDeviceModel(modelId)
    if (model === undefined) throw ToolError.notFound(`Unknown device model "${modelId}". Call list_device_models for the model ids.`)
    return model
  }

  modelName(model: CatalogDeviceModel): string {
    return this.messages.text(model.nameKey) ?? model.id
  }

  sampleList(): SampleInfo[] {
    return this.samples.available().map((sample) => this.sampleInfo(sample))
  }

  /** A fresh lab from the sample, titled with its English title. */
  openSample(sampleId: string): { doc: LabDocument; info: SampleInfo } {
    const sample = this.samples.find(sampleId)
    if (sample === undefined) throw ToolError.notFound(`Unknown sample "${sampleId}". Call list_samples for the sample ids.`)
    const info = this.sampleInfo(sample)
    return { doc: openSampleLab(sample, { title: info.title }), info }
  }

  private modelInfo(model: CatalogDeviceModel): ModelInfo {
    return {
      modelId: model.id,
      name: this.modelName(model),
      kind: model.kind,
      category: model.category,
      ports: PortGroups.describe(model.ports),
      capabilities: model.capabilities,
      useCase: this.messages.text(model.useCaseKey) ?? '',
    }
  }

  private sampleInfo(sample: SampleDefinition): SampleInfo {
    return {
      sampleId: sample.id,
      category: this.messages.text(SampleTextKeys.categoryTitle(sample.category)) ?? sample.category,
      level: this.messages.text(SampleTextKeys.level(sample.level)) ?? sample.level,
      title: this.messages.text(SampleTextKeys.title(sample.id)) ?? sample.id,
      summary: this.messages.text(SampleTextKeys.summary(sample.id)) ?? '',
    }
  }
}
