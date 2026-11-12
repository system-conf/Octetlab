// The NAT card's form (docs/SECURITY_PACK.md §8): pools, static mappings (with optional TCP / UDP
// port forwarding) and `ip nat inside source list …` rules, as editable text rows. Validation is about
// format and references only, never whether the NAT design is "right" (exercises keep their answers).
import type { Device, NatDynamicRule, NatPool, NatSettings, NatStaticRule } from '../../../../domain'
import type { LocalizedMessage } from '../../../../domain/Messages'
import { Ipv4 } from '../../../../engine'
import { localizedMessage } from '../../../../i18n/messageKeys'
import { L3Interfaces } from '../../../../net/L3Interfaces'
import { type FieldErrors, newRowKey, parseWholeNumber, pick } from '../../model/formTypes'
import { Ipv4Fields } from '../../model/Ipv4Fields'

export const NAT_STATIC_PROTOCOLS = ['', 'tcp', 'udp'] as const
export const NAT_TARGET_KINDS = ['interface', 'pool'] as const

export interface NatPoolDraft {
  key: string
  name: string
  start: string
  end: string
  netmask: string
}

export interface NatStaticDraft {
  key: string
  /** '' = address only (1:1). */
  protocol: (typeof NAT_STATIC_PROTOCOLS)[number]
  insideLocal: string
  localPort: string
  insideGlobal: string
  globalPort: string
}

export interface NatRuleDraft {
  key: string
  aclName: string
  targetKind: (typeof NAT_TARGET_KINDS)[number]
  poolName: string
  interfaceId: string
  overload: boolean
}

export interface NatDraft {
  pools: NatPoolDraft[]
  statics: NatStaticDraft[]
  rules: NatRuleDraft[]
}

export interface NatErrors {
  pools: FieldErrors<'name' | 'start' | 'end' | 'netmask'>[]
  statics: FieldErrors<'insideLocal' | 'localPort' | 'insideGlobal' | 'globalPort'>[]
  rules: FieldErrors<'aclName' | 'poolName' | 'interfaceId'>[]
}

const NAME = /^\S{1,64}$/
const MAX_PORT = 65535

function message(key: 'nameRequired' | 'duplicatePool' | 'endBeforeStart' | 'differentSubnets' | 'port' | 'duplicateStatic' | 'unknownPool' | 'interfaceRequired' | 'duplicateRule'): LocalizedMessage {
  return localizedMessage(`nat:form.errors.${key}`)
}

function portText(port: number | undefined): string {
  return port === undefined ? '' : String(port)
}

export class NatFormModel {
  static toDraft(nat: NatSettings | undefined): NatDraft {
    return {
      pools: (nat?.pools ?? []).map((pool, index) => ({ key: `pool${index}`, ...pool })),
      statics: (nat?.statics ?? []).map((rule, index) => ({
        key: `static${index}`,
        protocol: rule.protocol ?? '',
        insideLocal: rule.insideLocal,
        localPort: portText(rule.insideLocalPort),
        insideGlobal: rule.insideGlobal,
        globalPort: portText(rule.insideGlobalPort),
      })),
      rules: (nat?.dynamics ?? []).map((rule, index) => ({
        key: `rule${index}`,
        aclName: rule.aclName,
        targetKind: rule.target.kind,
        poolName: rule.target.kind === 'pool' ? rule.target.poolName : '',
        interfaceId: rule.target.kind === 'interface' ? rule.target.interfaceId : '',
        overload: rule.overload,
      })),
    }
  }

  static newPool(): NatPoolDraft {
    return { key: newRowKey(), name: '', start: '', end: '', netmask: '' }
  }

  static newStatic(): NatStaticDraft {
    return { key: newRowKey(), protocol: '', insideLocal: '', localPort: '', insideGlobal: '', globalPort: '' }
  }

  static newRule(): NatRuleDraft {
    return { key: newRowKey(), aclName: '', targetKind: 'interface', poolName: '', interfaceId: '', overload: true }
  }

  /** Interfaces a rule can borrow its address from: routed ports and sub-interfaces. */
  static interfaces(device: Device): string[] {
    return L3Interfaces.of(device)
      .filter((iface) => iface.kind === 'routed' || iface.kind === 'subInterface')
      .map((iface) => iface.id)
  }

  static targetKind(value: string): NatRuleDraft['targetKind'] | undefined {
    return pick(NAT_TARGET_KINDS, value)
  }

  static protocol(value: string): NatStaticDraft['protocol'] | undefined {
    return pick(NAT_STATIC_PROTOCOLS, value)
  }

  static validate(draft: NatDraft, interfaceIds: readonly string[]): NatErrors {
    const poolNames = new Set<string>()
    const pools = draft.pools.map((row) => {
      const errors: NatErrors['pools'][number] = {}
      const name = row.name.trim()
      if (!NAME.test(name)) errors.name = message('nameRequired')
      else if (poolNames.has(name)) errors.name = message('duplicatePool')
      poolNames.add(name)
      const start = Ipv4Fields.address(row.start, true)
      const end = Ipv4Fields.address(row.end, true)
      const mask = Ipv4Fields.mask(row.netmask, true)
      if (start) errors.start = start
      if (end) errors.end = end
      if (mask) errors.netmask = mask
      if (!start && !end && (Ipv4.parse(row.end.trim()) ?? 0) < (Ipv4.parse(row.start.trim()) ?? 0)) errors.end = message('endBeforeStart')
      else if (!start && !end && !mask && !Ipv4.sameSubnet(row.start.trim(), row.end.trim(), row.netmask.trim())) errors.end = message('differentSubnets')
      return errors
    })
    const seenStatics = new Set<string>()
    const statics = draft.statics.map((row) => {
      const errors: NatErrors['statics'][number] = {}
      const local = Ipv4Fields.address(row.insideLocal, true)
      const global = Ipv4Fields.address(row.insideGlobal, true)
      if (local) errors.insideLocal = local
      if (global) errors.insideGlobal = global
      if (row.protocol !== '') {
        if (parseWholeNumber(row.localPort, 1, MAX_PORT) === null) errors.localPort = message('port')
        if (parseWholeNumber(row.globalPort, 1, MAX_PORT) === null) errors.globalPort = message('port')
      }
      const signature = [row.protocol, row.insideLocal.trim(), row.protocol === '' ? '' : row.localPort.trim()].join('|')
      if (seenStatics.has(signature) && !errors.insideLocal) errors.insideLocal = message('duplicateStatic')
      seenStatics.add(signature)
      return errors
    })
    const seenAcls = new Set<string>()
    const rules = draft.rules.map((row) => {
      const errors: NatErrors['rules'][number] = {}
      const acl = row.aclName.trim()
      if (!NAME.test(acl)) errors.aclName = message('nameRequired')
      else if (seenAcls.has(acl)) errors.aclName = message('duplicateRule')
      seenAcls.add(acl)
      if (row.targetKind === 'pool' && !poolNames.has(row.poolName.trim())) errors.poolName = message('unknownPool')
      if (row.targetKind === 'interface' && !interfaceIds.includes(row.interfaceId)) errors.interfaceId = message('interfaceRequired')
      return errors
    })
    return { pools, statics, rules }
  }

  /** The NAT settings of a valid draft; undefined when it is empty (factory = absent key). */
  static toSettings(draft: NatDraft): NatSettings | undefined {
    const pools: NatPool[] = draft.pools.map((row) => ({ name: row.name.trim(), start: row.start.trim(), end: row.end.trim(), netmask: row.netmask.trim() }))
    const statics = draft.statics.map((row) => NatFormModel.staticOf(row))
    const dynamics: NatDynamicRule[] = draft.rules.map((row) => ({
      kind: 'dynamic',
      aclName: row.aclName.trim(),
      target: row.targetKind === 'pool' ? { kind: 'pool', poolName: row.poolName.trim() } : { kind: 'interface', interfaceId: row.interfaceId },
      overload: row.overload,
    }))
    return pools.length === 0 && statics.length === 0 && dynamics.length === 0 ? undefined : { pools, statics, dynamics }
  }

  /** `device` with the draft's NAT settings (an empty draft removes the key). Call after `validate`. */
  static apply(device: Device, draft: NatDraft): Device {
    const nat = NatFormModel.toSettings(draft)
    const features = { ...device.features }
    if (nat === undefined) delete features.nat
    else features.nat = nat
    const next = { ...device }
    delete next.features
    return Object.keys(features).length === 0 ? next : { ...next, features }
  }

  private static staticOf(row: NatStaticDraft): NatStaticRule {
    const base: NatStaticRule = { kind: 'static', insideLocal: row.insideLocal.trim(), insideGlobal: row.insideGlobal.trim() }
    if (row.protocol === '') return base
    return {
      ...base,
      protocol: row.protocol,
      insideLocalPort: parseWholeNumber(row.localPort, 1, MAX_PORT) ?? 1,
      insideGlobalPort: parseWholeNumber(row.globalPort, 1, MAX_PORT) ?? 1,
    }
  }
}
