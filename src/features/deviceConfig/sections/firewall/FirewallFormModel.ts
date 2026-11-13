// Draft, validation and apply of the Firewall card (docs/FIREWALL_PACK.md §7): the nameif / level of
// every interface, the same-security switches, ICMP tracking and the idle timeouts. Same storage rules
// as the CLI: a factory value is an absent key (§2 D2, D9, D10).
import type { Device, FirewallSettings, FirewallTimeouts, L3Settings, Port } from '../../../../domain'
import { localizedMessage } from '../../../../i18n/messageKeys'
import { firewallTimeoutsSchema } from '../../../../lab/schemas/firewallSchemas'
import { anyRowErrors, type FieldErrors, hasErrors } from '../../model/formTypes'
import { type FirewallInterfaceField, FirewallInterfaceRules } from './FirewallInterfaceRules'

export const TIMEOUT_KEYS = ['tcp', 'halfClosed', 'udp', 'icmp'] as const
export type TimeoutKey = (typeof TIMEOUT_KEYS)[number]

/** Factory idle timeouts in seconds (D10). */
export const DEFAULT_TIMEOUTS: Readonly<Record<TimeoutKey, number>> = { tcp: 3600, halfClosed: 600, udp: 120, icmp: 2 }

/** Longest timeout the lab format accepts (firewallSchemas: one week). */
export const MAX_TIMEOUT_SECONDS = firewallTimeoutsSchema.shape.tcp.unwrap().maxValue ?? 0

export interface InterfaceRowDraft {
  /** Interface id ('Gi0/0', 'Gi0/0.10'); rows are fixed, one per interface. */
  id: string
  nameif: string
  /** '' = the default level (100 for inside, 0 otherwise). */
  securityLevel: string
}

export interface FirewallDraft {
  interfaces: InterfaceRowDraft[]
  sameSecurityInterInterface: boolean
  sameSecurityIntraInterface: boolean
  inspectIcmp: boolean
  timeouts: Record<TimeoutKey, string>
}

export interface FirewallErrors {
  interfaces: FieldErrors<FirewallInterfaceField>[]
  timeouts: FieldErrors<TimeoutKey>
}

const DIGITS = /^\d{1,10}$/

function timeoutOf(text: string, key: TimeoutKey): number | null {
  const value = text.trim()
  if (!DIGITS.test(value)) return null
  const parsed = firewallTimeoutsSchema.shape[key].unwrap().safeParse(Number(value))
  return parsed.success ? parsed.data : null
}

export class FirewallFormModel {
  static toDraft(device: Device): FirewallDraft {
    const settings = device.features?.firewall ?? {}
    const timeouts = settings.timeouts ?? {}
    return {
      interfaces: FirewallInterfaceRules.interfacesOf(device).map(({ id, settings: row }) => ({
        id,
        nameif: row?.nameif ?? '',
        securityLevel: FirewallInterfaceRules.levelText(row),
      })),
      sameSecurityInterInterface: settings.sameSecurityInterInterface === true,
      sameSecurityIntraInterface: settings.sameSecurityIntraInterface === true,
      inspectIcmp: settings.inspectIcmp !== false,
      timeouts: {
        tcp: String(timeouts.tcp ?? DEFAULT_TIMEOUTS.tcp),
        halfClosed: String(timeouts.halfClosed ?? DEFAULT_TIMEOUTS.halfClosed),
        udp: String(timeouts.udp ?? DEFAULT_TIMEOUTS.udp),
        icmp: String(timeouts.icmp ?? DEFAULT_TIMEOUTS.icmp),
      },
    }
  }

  /** The key the card remounts its draft on: the interfaces' saved nameif / level. */
  static interfacesKey(device: Device): string {
    return JSON.stringify(FirewallInterfaceRules.interfacesOf(device))
  }

  static validate(draft: FirewallDraft): FirewallErrors {
    const interfaces = draft.interfaces.map((row, index) => {
      const taken = new Set(draft.interfaces.filter((_, other) => other !== index).map((other) => other.nameif.trim()))
      taken.delete('')
      return FirewallInterfaceRules.validate(row.nameif, row.securityLevel, taken)
    })
    const timeouts: FieldErrors<TimeoutKey> = {}
    for (const key of TIMEOUT_KEYS) {
      if (timeoutOf(draft.timeouts[key], key) === null) timeouts[key] = localizedMessage('firewall:errors.timeoutRange', { max: MAX_TIMEOUT_SECONDS })
    }
    return { interfaces, timeouts }
  }

  static isValid(errors: FirewallErrors): boolean {
    return !anyRowErrors(errors.interfaces) && !hasErrors(errors.timeouts)
  }

  /** The device after the draft (only call when valid). Settings the card does not show are kept. */
  static apply(device: Device, draft: FirewallDraft): Device {
    const rows = new Map(draft.interfaces.map((row) => [row.id, FirewallInterfaceRules.settingsOf(row.nameif, row.securityLevel)]))
    const update = (id: string, l3: L3Settings): L3Settings => (rows.has(id) ? FirewallInterfaceRules.withSettings(l3, rows.get(id)) : l3)
    const ports = device.ports.map((port): Port => {
      if (port.role !== 'routed') return port
      return { ...port, l3: update(port.id, port.l3), subInterfaces: port.subInterfaces.map((sub) => ({ ...sub, l3: update(sub.id, sub.l3) })) }
    })
    const features = { ...device.features }
    delete features.firewall
    const firewall = FirewallFormModel.settingsOf(device.features?.firewall ?? {}, draft)
    if (firewall !== undefined) features.firewall = firewall
    const next: Device = { ...device, ports }
    delete next.features
    return Object.keys(features).length === 0 ? next : { ...next, features }
  }

  private static settingsOf(previous: FirewallSettings, draft: FirewallDraft): FirewallSettings | undefined {
    const timeouts: FirewallTimeouts = {}
    for (const key of TIMEOUT_KEYS) {
      const value = timeoutOf(draft.timeouts[key], key)
      if (value !== null && value !== DEFAULT_TIMEOUTS[key]) timeouts[key] = value
    }
    const next: FirewallSettings = { ...previous }
    delete next.sameSecurityInterInterface
    delete next.sameSecurityIntraInterface
    delete next.inspectIcmp
    delete next.timeouts
    if (draft.sameSecurityInterInterface) next.sameSecurityInterInterface = true
    if (draft.sameSecurityIntraInterface) next.sameSecurityIntraInterface = true
    if (!draft.inspectIcmp) next.inspectIcmp = false
    if (Object.keys(timeouts).length > 0) next.timeouts = timeouts
    return Object.keys(next).length === 0 ? undefined : next
  }
}
