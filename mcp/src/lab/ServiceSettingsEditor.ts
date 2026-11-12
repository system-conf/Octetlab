// DHCP and DNS server settings of a device (routers, servers, wireless routers), validated and built by
// the app's own form models (the GUI's DHCP / DNS cards), so the rules are the same as in the app.
// Absent fields keep their current value; a given list replaces the whole list like the GUI form.
import type { DhcpServerSettings, DnsServerSettings } from '../../../src/domain'
import { AddressListParser } from '../../../src/features/deviceConfig/model/AddressListParser'
import { DhcpPoolFormModel, type DhcpPoolDraft, type ExcludedRangeDraft } from '../../../src/features/deviceConfig/model/DhcpPoolFormModel'
import { DnsServiceFormModel } from '../../../src/features/deviceConfig/model/DnsServiceFormModel'
import type { FieldProblems } from './FieldProblems'

export interface DhcpPoolInput {
  name: string
  network: string
  mask: string
  rangeStart?: string | undefined
  rangeEnd?: string | undefined
  defaultRouter?: string | undefined
  dnsServers?: string[] | undefined
}

export interface ExcludedRangeInput {
  start: string
  end?: string | undefined
}

export interface DhcpInput {
  enabled?: boolean | undefined
  pools?: DhcpPoolInput[] | undefined
  excludedRanges?: ExcludedRangeInput[] | undefined
}

export interface DnsRecordInput {
  name: string
  address: string
}

export interface DnsInput {
  enabled?: boolean | undefined
  forwarders?: string[] | undefined
  records?: DnsRecordInput[] | undefined
}

export class ServiceSettingsEditor {
  private readonly problems: FieldProblems

  constructor(problems: FieldProblems) {
    this.problems = problems
  }

  /** The device's DHCP server after `input`; a validation ToolError lists every bad field. */
  dhcp(current: DhcpServerSettings | undefined, input: DhcpInput, deviceId: string): DhcpServerSettings {
    const draft = DhcpPoolFormModel.toDraft(current)
    const next = {
      enabled: input.enabled ?? draft.enabled,
      pools: input.pools === undefined ? draft.pools : input.pools.map((pool, index) => this.poolDraft(pool, index, current)),
      excluded: input.excludedRanges === undefined ? draft.excluded : input.excludedRanges.map((range, index) => this.excludedDraft(range, index)),
    }
    const errors = DhcpPoolFormModel.validate(next)
    this.problems.check(`The DHCP server of ${deviceId}`, [...this.problems.rows('dhcp.pools', errors.pools), ...this.problems.rows('dhcp.excludedRanges', errors.excluded)])
    return DhcpPoolFormModel.apply(next)
  }

  /** The device's DNS server after `input`; a validation ToolError lists every bad field. */
  dns(current: DnsServerSettings | undefined, input: DnsInput, deviceId: string): DnsServerSettings {
    const draft = DnsServiceFormModel.toDraft(current)
    const next = {
      enabled: input.enabled ?? draft.enabled,
      forwarders: input.forwarders === undefined ? draft.forwarders : AddressListParser.format(input.forwarders),
      records: input.records === undefined ? draft.records : input.records.map((record, index) => ({ key: `input${index}`, name: record.name, address: record.address })),
    }
    const errors = DnsServiceFormModel.validate(next)
    this.problems.check(`The DNS server of ${deviceId}`, [...this.problems.one('dns.forwarders', errors.forwarders), ...this.problems.rows('dns.records', errors.records)])
    return DnsServiceFormModel.apply(next)
  }

  /** A pool row; a pool with the same name keeps its leases (like the GUI form). */
  private poolDraft(pool: DhcpPoolInput, index: number, current: DhcpServerSettings | undefined): DhcpPoolDraft {
    const original = current?.pools.find((existing) => existing.id === pool.name.trim())
    return {
      key: `input${index}`,
      ...(original === undefined ? {} : { original }),
      name: pool.name,
      network: pool.network,
      mask: pool.mask,
      rangeStart: pool.rangeStart ?? '',
      rangeEnd: pool.rangeEnd ?? '',
      defaultRouter: pool.defaultRouter ?? '',
      dnsServers: AddressListParser.format(pool.dnsServers ?? []),
    }
  }

  private excludedDraft(range: ExcludedRangeInput, index: number): ExcludedRangeDraft {
    return { key: `input${index}`, start: range.start, end: range.end ?? '' }
  }
}
