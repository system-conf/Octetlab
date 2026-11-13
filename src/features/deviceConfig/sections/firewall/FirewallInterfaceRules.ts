// `nameif` / `security-level` of firewall interfaces (docs/FIREWALL_PACK.md §2 D8, §4), shared by the
// Firewall card and the port editor. Form text is parsed with the lab's zod schema of record, so the
// GUI accepts exactly what a lab file may hold; the messages reuse the SecurityInvariants codes.
import type { Device, FirewallInterfaceSettings, L3Features, L3Settings, SecurityInvariantCode } from '../../../../domain'
import type { LocalizedMessage } from '../../../../domain/Messages'
import { localizedMessage } from '../../../../i18n/messageKeys'
import { firewallInterfaceSchema } from '../../../../lab/schemas/firewallSchemas'
import type { FieldErrors } from '../../model/formTypes'

export type FirewallInterfaceField = 'nameif' | 'securityLevel'

/** One routed port or sub-interface of a firewall, with its current settings (undefined = no nameif). */
export interface FirewallInterfaceRef {
  /** 'Gi0/0' or 'Gi0/0.10'. */
  id: string
  settings: FirewallInterfaceSettings | undefined
}

/** The nameif whose default level is 100 instead of 0 (D8). */
export const INSIDE_NAMEIF = 'inside'
const INSIDE_LEVEL = 100
const OTHER_LEVEL = 0

const nameifSchema = firewallInterfaceSchema.shape.nameif
const levelSchema = firewallInterfaceSchema.shape.securityLevel.unwrap()
/** One word, as the CLI reads it. */
const ONE_WORD = /^\S+$/
const DIGITS = /^\d{1,10}$/

function invariantMessage(code: Extract<SecurityInvariantCode, 'duplicateNameif' | 'securityLevelOutOfRange'>, params?: Record<string, string>): LocalizedMessage {
  return localizedMessage(`firewall:errors.${code}`, params)
}

export class FirewallInterfaceRules {
  /** Routed ports and their sub-interfaces, in port order. */
  static interfacesOf(device: Device): FirewallInterfaceRef[] {
    const found: FirewallInterfaceRef[] = []
    for (const port of device.ports) {
      if (port.role !== 'routed') continue
      found.push({ id: port.id, settings: port.l3.features?.firewall })
      for (const sub of port.subInterfaces) found.push({ id: sub.id, settings: sub.l3.features?.firewall })
    }
    return found
  }

  /** The level the firewall uses: the stored one, else 100 for 'inside' and 0 for other names (D8). */
  static effectiveLevel(settings: FirewallInterfaceSettings): number {
    return settings.securityLevel ?? (settings.nameif === INSIDE_NAMEIF ? INSIDE_LEVEL : OTHER_LEVEL)
  }

  /** The level typed in a form, or null when it is not a whole number in 0..100 (empty = absent). */
  static parseLevel(text: string): number | undefined | null {
    const value = text.trim()
    if (value === '') return undefined
    if (!DIGITS.test(value)) return null
    const parsed = levelSchema.safeParse(Number(value))
    return parsed.success ? parsed.data : null
  }

  /**
   * Errors of one interface row. `taken` holds the nameifs of the device's other interfaces; an empty
   * nameif means "no firewall settings", so a level without a name is refused.
   */
  static validate(nameif: string, level: string, taken: ReadonlySet<string>): FieldErrors<FirewallInterfaceField> {
    const errors: FieldErrors<FirewallInterfaceField> = {}
    const name = nameif.trim()
    if (name !== '') {
      if (!ONE_WORD.test(name) || !nameifSchema.safeParse(name).success) errors.nameif = localizedMessage('firewall:errors.nameifInvalid')
      else if (taken.has(name)) errors.nameif = invariantMessage('duplicateNameif', { name })
    }
    if (FirewallInterfaceRules.parseLevel(level) === null) errors.securityLevel = invariantMessage('securityLevelOutOfRange')
    else if (name === '' && level.trim() !== '') errors.securityLevel = localizedMessage('firewall:errors.levelNeedsNameif')
    return errors
  }

  /** The stored settings of a valid row; undefined when the nameif is empty. */
  static settingsOf(nameif: string, level: string): FirewallInterfaceSettings | undefined {
    const name = nameif.trim()
    if (name === '') return undefined
    const securityLevel = FirewallInterfaceRules.parseLevel(level)
    return typeof securityLevel === 'number' ? { nameif: name, securityLevel } : { nameif: name }
  }

  /** `l3` with these firewall settings (undefined removes them); other features are kept. */
  static withSettings(l3: L3Settings, settings: FirewallInterfaceSettings | undefined): L3Settings {
    const features: L3Features = { ...l3.features }
    delete features.firewall
    if (settings !== undefined) features.firewall = settings
    const next: L3Settings = { ...l3 }
    delete next.features
    return Object.keys(features).length === 0 ? next : { ...next, features }
  }

  /** The level shown in a form: the stored one, or '' when absent. */
  static levelText(settings: FirewallInterfaceSettings | undefined): string {
    return settings?.securityLevel === undefined ? '' : String(settings.securityLevel)
  }
}
