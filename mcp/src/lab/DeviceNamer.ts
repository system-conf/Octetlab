// Default device names as the web app gives them: "<kind name> <n>" ("Router 1", "PC 2"), with the
// model's own base for models that are not what their kind says ("Smart TV 1").
import { DefaultDeviceNames } from '../../../src/catalog/DefaultDeviceNames'
import type { DeviceModel, NetworkState } from '../../../src/domain'
import type { EnglishMessages } from '../text/EnglishMessages'

export class DeviceNamer {
  private readonly messages: EnglishMessages

  constructor(messages: EnglishMessages) {
    this.messages = messages
  }

  defaultName(model: DeviceModel, state: NetworkState): string {
    const modelKey = DefaultDeviceNames.modelBaseKey(model.id)
    const base = (modelKey === null ? null : this.messages.text(modelKey)) ?? this.messages.text(`workspace:deviceKinds.${model.kind}`) ?? model.kind
    const format = (number: number) => `${base} ${number}`
    return format(DefaultDeviceNames.firstFreeNumber(format, state.devices.map((device) => device.name)))
  }
}
