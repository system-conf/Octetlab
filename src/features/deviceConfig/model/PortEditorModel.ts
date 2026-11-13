// Port editor logic: draft ↔ Port by role (switched, routed, host NIC, radio), validation, and
// what the port's type offers (speeds from the model template, duplex, clock rate, role change on
// an L3 switch).
import type {
  AddressingMode,
  Device,
  DeviceModel,
  L3Settings,
  Port,
  PortDuplex,
  PortSpeed,
  RadioPort,
  SwitchportMode,
  SwitchportSettings,
} from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import { anyRowErrors, hasErrors, optionalText, parseWholeNumber, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'
import { PortSecurityModel, type PortSecurityDraft } from './PortSecurityModel'
import { SubInterfaceFormModel, type SubInterfaceDraft, type SubInterfaceField } from './SubInterfaceFormModel'
import { SwitchManagement } from './SwitchManagement'
import { VlanListParser } from './VlanListParser'

export interface PortDraft {
  role: Port['role']
  adminUp: boolean
  description: string
  /** 'auto' or a speed in Mbit/s as text (select value). */
  speed: string
  duplex: PortDuplex
  mode: SwitchportMode
  accessVlan: string
  nativeVlan: string
  allowedAll: boolean
  allowedList: string
  addressing: AddressingMode
  address: string
  mask: string
  clockRate: string
  subInterfaces: SubInterfaceDraft[]
  /** Pack 5.2: ACL bindings and NAT role of a routed port (PortSecurityModel). */
  security: PortSecurityDraft
}

export type PortField = 'accessVlan' | 'nativeVlan' | 'allowedList' | 'address' | 'mask' | 'clockRate' | 'aclIn' | 'aclOut' | 'nameif' | 'securityLevel'

export interface PortErrors {
  fields: FieldErrors<PortField>
  subInterfaces: FieldErrors<SubInterfaceField>[]
}

/** What the editor offers for this port. */
export interface PortOptions {
  /** Speeds of the model's port template; [] = no speed setting. */
  speeds: PortSpeed[]
  duplex: boolean
  /** L3 switch: the port may switch between switchport and routed port. */
  roleChoice: boolean
  /** A switchport's mode and VLANs can be set (false on an unmanaged switch, SwitchManagement). */
  vlanSettings: boolean
}

/** Choices of the editor's selects. */
export const ROLE_CHOICES = ['switched', 'routed'] as const
export const SWITCHPORT_MODES: readonly SwitchportMode[] = ['access', 'trunk']
export const DUPLEX_MODES: readonly PortDuplex[] = ['auto', 'full', 'half']
export const ADDRESSING_MODES: readonly AddressingMode[] = ['static', 'dhcp']
export const AUTO_SPEED = 'auto'
/** Allowed VLANs of a trunk: every VLAN or a list. */
export const ALLOWED_CHOICES = ['all', 'list'] as const

const DEFAULT_L2: SwitchportSettings = { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' }
const KNOWN_SPEEDS: readonly PortSpeed[] = [10, 100, 1000, 10000]
const MAX_CLOCK_RATE = 4000000000

type PortCommonFields = Omit<RadioPort, 'role'>

function isPortSpeed(value: number): value is Exclude<PortSpeed, 'auto'> {
  return KNOWN_SPEEDS.includes(value as PortSpeed)
}

export class PortEditorModel {
  static options(device: Device, model: DeviceModel | undefined, port: Port): PortOptions {
    const template = model?.ports.find((candidate) => candidate.id === port.id)
    const ethernet = port.medium === 'copper' || port.medium === 'fiber'
    const switchOrRouted = port.role === 'switched' || port.role === 'routed'
    return {
      speeds: ethernet && template ? template.speedsMbps.filter(isPortSpeed) : [],
      duplex: port.medium === 'copper',
      roleChoice: ethernet && switchOrRouted && device.kind === 'l3Switch' && (model?.capabilities.includes('l3Switching') ?? true),
      vlanSettings: SwitchManagement.vlansConfigurable(model),
    }
  }

  static hasSubInterfaces(draft: PortDraft, port: Port): boolean {
    return draft.role === 'routed' && port.medium !== 'serial'
  }

  static hasClockRate(draft: PortDraft, port: Port): boolean {
    return draft.role === 'routed' && port.medium === 'serial'
  }

  static toDraft(port: Port): PortDraft {
    const l2 = port.role === 'switched' ? port.l2 : DEFAULT_L2
    const ipv4 = port.role === 'routed' || port.role === 'host' ? port.l3.ipv4 : { addressing: 'static' as const, address: '', mask: '' }
    return {
      role: port.role,
      adminUp: port.adminUp,
      description: port.description ?? '',
      speed: String(port.speed ?? 'auto'),
      duplex: port.duplex ?? 'auto',
      mode: l2.mode,
      accessVlan: String(l2.accessVlan),
      nativeVlan: String(l2.nativeVlan),
      allowedAll: l2.allowedVlans === 'all',
      allowedList: l2.allowedVlans === 'all' ? '' : VlanListParser.format(l2.allowedVlans),
      addressing: ipv4.addressing,
      address: ipv4.address,
      mask: ipv4.mask,
      clockRate: port.role === 'routed' && port.serial?.clockRate !== undefined ? String(port.serial.clockRate) : '',
      subInterfaces: port.role === 'routed' ? port.subInterfaces.map((sub) => SubInterfaceFormModel.toDraft(sub, port.id)) : [],
      security: PortSecurityModel.toDraft(port.role === 'routed' ? port.l3 : undefined),
    }
  }

  /** Checks only what the current role and mode show; `device` enables the firewall nameif / level checks. */
  static validate(draft: PortDraft, port: Port, device?: Device): PortErrors {
    const fields: FieldErrors<PortField> = {}
    if (draft.role === 'switched') {
      if (draft.mode === 'access') fields.accessVlan = VlanListParser.idError(draft.accessVlan)
      if (draft.mode === 'trunk') {
        fields.nativeVlan = VlanListParser.idError(draft.nativeVlan)
        if (!draft.allowedAll) {
          const parsed = VlanListParser.parse(draft.allowedList)
          if (!parsed.ok) fields.allowedList = parsed.error
        }
      }
    }
    if ((draft.role === 'routed' || draft.role === 'host') && draft.addressing === 'static') {
      // A NIC set to static needs an address (as in Windows); an interface may stay unaddressed.
      Object.assign(fields, Ipv4Fields.interfaceAddress(draft.address, draft.mask, draft.role === 'host'))
    }
    if (draft.role === 'routed') {
      fields.aclIn = PortSecurityModel.nameError(draft.security.aclIn)
      fields.aclOut = PortSecurityModel.nameError(draft.security.aclOut)
      if (device !== undefined) Object.assign(fields, PortSecurityModel.firewallErrors(device, port.id, draft.role, draft.security))
    }
    if (PortEditorModel.hasClockRate(draft, port) && draft.clockRate.trim() !== '' && parseWholeNumber(draft.clockRate, 1, MAX_CLOCK_RATE) === null) {
      fields.clockRate = localizedMessage('deviceConfig:errors.clockRate')
    }
    const subInterfaces = PortEditorModel.hasSubInterfaces(draft, port) ? SubInterfaceFormModel.validate(draft.subInterfaces, port.id) : []
    return { fields: PortEditorModel.defined(fields), subInterfaces }
  }

  static isValid(errors: PortErrors): boolean {
    return !hasErrors(errors.fields) && !anyRowErrors(errors.subInterfaces)
  }

  /** The edited port; settings the editor does not show (MAC, PoE, pinout, features) are kept. */
  static apply(draft: PortDraft, port: Port): Port {
    const common = PortEditorModel.commonOf(draft, port)
    switch (draft.role) {
      case 'switched':
        return { ...common, role: 'switched', l2: PortEditorModel.l2Of(draft, port) }
      case 'routed': {
        const clockRate = parseWholeNumber(draft.clockRate, 1, MAX_CLOCK_RATE)
        const serial = PortEditorModel.hasClockRate(draft, port) && clockRate !== null ? { serial: { clockRate } } : {}
        const subInterfaces = PortEditorModel.hasSubInterfaces(draft, port)
          ? draft.subInterfaces.map((row) => SubInterfaceFormModel.apply(row, port.id))
          : []
        const l3 = PortSecurityModel.apply(PortEditorModel.l3Of(draft, port), draft.security)
        return { ...common, role: 'routed', l3, subInterfaces, ...serial }
      }
      case 'host':
        return { ...common, role: 'host', l3: PortEditorModel.l3Of(draft, port) }
      case 'radio':
      case 'console':
      case 'passive':
        return { ...common, role: draft.role }
    }
  }

  private static commonOf(draft: PortDraft, port: Port): PortCommonFields {
    const description = optionalText(draft.description)
    const speed = draft.speed === 'auto' ? undefined : Number(draft.speed)
    return {
      id: port.id,
      medium: port.medium,
      ...(port.mac !== undefined ? { mac: port.mac } : {}),
      adminUp: draft.adminUp,
      ...(description !== undefined ? { description } : {}),
      ...(speed !== undefined && isPortSpeed(speed) ? { speed } : {}),
      ...(draft.duplex !== 'auto' ? { duplex: draft.duplex } : {}),
      ...(port.autoMdix !== undefined ? { autoMdix: port.autoMdix } : {}),
      ...(port.pinout !== undefined ? { pinout: port.pinout } : {}),
      ...(port.poe !== undefined ? { poe: port.poe } : {}),
    }
  }

  /** Fields of the other mode are kept from the port (IOS keeps the access VLAN while trunking). */
  private static l2Of(draft: PortDraft, port: Port): SwitchportSettings {
    const previous = port.role === 'switched' ? port.l2 : DEFAULT_L2
    const allowed = VlanListParser.parse(draft.allowedList)
    return {
      ...previous,
      mode: draft.mode,
      accessVlan: VlanListParser.parseId(draft.accessVlan) ?? previous.accessVlan,
      nativeVlan: VlanListParser.parseId(draft.nativeVlan) ?? previous.nativeVlan,
      allowedVlans: draft.allowedAll ? 'all' : allowed.ok ? allowed.vlans : previous.allowedVlans,
    }
  }

  /** DHCP keeps the current lease until the server hands out a new one. */
  private static l3Of(draft: PortDraft, port: Port): L3Settings {
    const previous = port.role === 'routed' || port.role === 'host' ? port.l3 : undefined
    if (draft.addressing === 'dhcp') {
      return { ...previous, ipv4: { addressing: 'dhcp', address: previous?.ipv4.address ?? '', mask: previous?.ipv4.mask ?? '' } }
    }
    const address = draft.address.trim()
    return { ...previous, ipv4: { addressing: 'static', address, mask: address === '' ? '' : draft.mask.trim() } }
  }

  private static defined(fields: FieldErrors<PortField>): FieldErrors<PortField> {
    return Object.fromEntries(Object.entries(fields).filter(([, message]) => message !== undefined)) as FieldErrors<PortField>
  }
}
