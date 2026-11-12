// Lookups in the translation table (static rows + live dynamic rows). Most specific first, as IOS keeps
// extended (per-flow) entries in front of simple (address-only) ones.
import type { NatEndpoint, NatTranslation } from '../../contract/SecurityRuntime'
import type { NatFlow } from './NatPackets'

function sameEndpoint(a: NatEndpoint | undefined, b: NatEndpoint): boolean {
  return a !== undefined && a.ip === b.ip && a.port === b.port
}

function isExtended(entry: NatTranslation): boolean {
  return entry.protocol !== 'any'
}

export class NatTable {
  /** The row that translates an inside→outside packet of `flow`, if any. */
  static outbound(rows: readonly NatTranslation[], flow: NatFlow): NatTranslation | undefined {
    return (
      rows.find((entry) => entry.protocol === flow.protocol && sameEndpoint(entry.insideLocal, flow.src) && entry.outsideGlobal !== undefined && sameEndpoint(entry.outsideGlobal, flow.dst)) ??
      rows.find((entry) => entry.protocol === flow.protocol && entry.outsideGlobal === undefined && sameEndpoint(entry.insideLocal, flow.src)) ??
      NatTable.simpleByLocal(rows, flow.src.ip)
    )
  }

  /** The row that translates an outside→inside packet addressed to `flow.dst`, if any. */
  static inbound(rows: readonly NatTranslation[], flow: NatFlow): NatTranslation | undefined {
    return (
      rows.find((entry) => entry.protocol === flow.protocol && sameEndpoint(entry.insideGlobal, flow.dst) && entry.outsideGlobal?.ip === flow.src.ip) ??
      rows.find((entry) => entry.protocol === flow.protocol && sameEndpoint(entry.insideGlobal, flow.dst)) ??
      NatTable.simpleByGlobal(rows, flow.dst.ip)
    )
  }

  /** Inbound ICMP error: the row whose inside global side sent the quoted packet. */
  static quoted(rows: readonly NatTranslation[], quoted: NatFlow): NatTranslation | undefined {
    return (
      rows.find((entry) => entry.protocol === quoted.protocol && sameEndpoint(entry.insideGlobal, quoted.src)) ?? NatTable.simpleByGlobal(rows, quoted.src.ip)
    )
  }

  static simpleByLocal(rows: readonly NatTranslation[], ip: string): NatTranslation | undefined {
    return rows.find((entry) => !isExtended(entry) && entry.insideLocal.ip === ip)
  }

  static simpleByGlobal(rows: readonly NatTranslation[], ip: string): NatTranslation | undefined {
    return rows.find((entry) => !isExtended(entry) && entry.insideGlobal.ip === ip)
  }

  /** Same row (dynamic rows are compared by their identity fields). */
  static same(a: NatTranslation, b: NatTranslation): boolean {
    return (
      a.protocol === b.protocol &&
      a.origin === b.origin &&
      sameEndpoint(a.insideLocal, b.insideLocal) &&
      sameEndpoint(a.insideGlobal, b.insideGlobal) &&
      a.outsideGlobal?.ip === b.outsideGlobal?.ip &&
      a.outsideGlobal?.port === b.outsideGlobal?.port
    )
  }
}
