// Looking up devices of a lab and writing a changed device back through LabEditor, with clear errors
// for unknown ids and for updates the lab's invariants refuse.
import type { Device, LabDocument } from '../../../src/domain'
import { labEditor } from '../../../src/lab/LabEditor'
import { LabMessages } from '../../../src/lab/LabMessages'
import { ToolError } from '../errors/ToolError'
import type { EnglishMessages } from '../text/EnglishMessages'

export class DeviceAccess {
  private readonly messages: EnglishMessages
  private readonly labMessages = new LabMessages()

  constructor(messages: EnglishMessages) {
    this.messages = messages
  }

  require(doc: LabDocument, deviceId: string): Device {
    const device = doc.state.devices.find((candidate) => candidate.id === deviceId)
    if (device !== undefined) return device
    const known = doc.state.devices.map((candidate) => candidate.id).join(', ')
    throw ToolError.notFound(`Device "${deviceId}" is not in this lab. Devices: ${known === '' ? '(none)' : known}.`)
  }

  /** The lab with `device` in place of its old copy; a ToolError when the lab's rules refuse it. */
  update(doc: LabDocument, device: Device): LabDocument {
    const problems = labEditor.deviceUpdateProblems(doc, device)
    if (problems.length > 0) {
      const text = this.labMessages.fromViolations(problems).map((message) => this.messages.render(message))
      throw ToolError.refused(`The change to ${device.id} was not applied: ${text.join(' ')}`)
    }
    return labEditor.updateDevice(doc, device)
  }
}
