// Pack 5.2 fields of a routed port in the port editor (docs/SECURITY_PACK.md §4): `ip access-group`
// in / out and `ip nat inside|outside`. Kept apart from PortEditorModel so agents A / B can grow it.
import type { Device, L3Features, L3Settings, NatRole } from '../../../domain'
import type { LocalizedMessage } from '../../../domain/Messages'
import { localizedMessage } from '../../../i18n/messageKeys'

export const NAT_ROLE_CHOICES = ['', 'inside', 'outside'] as const
export type NatRoleChoice = (typeof NAT_ROLE_CHOICES)[number]

export interface PortSecurityDraft {
  aclIn: string
  aclOut: string
  natRole: NatRoleChoice
}

/** ACL names are one word (IOS); numbers are names too. */
const ACL_NAME = /^\S{1,200}$/

export class PortSecurityModel {
  static toDraft(l3: L3Settings | undefined): PortSecurityDraft {
    const features = l3?.features
    return { aclIn: features?.accessGroups?.in ?? '', aclOut: features?.accessGroups?.out ?? '', natRole: features?.natRole ?? '' }
  }

  /** ACL fields: routed ports of routers and L3 switches. */
  static showsAcl(device: Device, role: string): boolean {
    return role === 'routed' && device.routing !== undefined
  }

  /** NAT role: routed ports of routers (IOS L3 switches have no NAT). */
  static showsNat(device: Device, role: string): boolean {
    return PortSecurityModel.showsAcl(device, role) && device.kind !== 'l3Switch'
  }

  static nameError(name: string): LocalizedMessage | undefined {
    const trimmed = name.trim()
    return trimmed === '' || ACL_NAME.test(trimmed) ? undefined : localizedMessage('acl:port.nameError')
  }

  /** `l3` with the draft's bindings; empty fields remove their key (absent = IOS default). */
  static apply(l3: L3Settings, draft: PortSecurityDraft): L3Settings {
    const otherFeatures: L3Features = { ...l3.features }
    delete otherFeatures.accessGroups
    delete otherFeatures.natRole
    const aclIn = draft.aclIn.trim()
    const aclOut = draft.aclOut.trim()
    const natRole: NatRole | undefined = draft.natRole === '' ? undefined : draft.natRole
    const features: L3Features = {
      ...otherFeatures,
      ...(aclIn !== '' || aclOut !== '' ? { accessGroups: { ...(aclIn !== '' ? { in: aclIn } : {}), ...(aclOut !== '' ? { out: aclOut } : {}) } } : {}),
      ...(natRole !== undefined ? { natRole } : {}),
    }
    const next: L3Settings = { ...l3 }
    delete next.features
    return Object.keys(features).length === 0 ? next : { ...next, features }
  }
}
