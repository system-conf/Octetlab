// `show ip nat translations [verbose]` (IOS NAT monitoring guide, 15.2S, iadnat-monmain): static rows
// from the configuration, then the live dynamic rows of env.runtime. Columns are 18 wide plus one space,
// so long PAT endpoints still keep a single space between them, as in the guide's examples.
import type { Device, NatSettings } from '../../domain'
import type { NatEndpoint, NatTranslation } from '../../sim/contract/SecurityRuntime'
import { NatConfig } from '../../sim/policy/nat/NatConfig'
import { NatRuntime } from '../../sim/policy/nat/NatRuntime'
import type { DeviceRuntime } from '../../sim/contract'

const HEADER = 'Pro Inside global      Inside local       Outside local      Outside global'
const COLUMN = 18
const NONE = '---'
const MS_PER_SECOND = 1000

function endpoint(value: NatEndpoint | undefined): string {
  if (value === undefined) return NONE
  return value.port === undefined ? value.ip : `${value.ip}:${value.port}`
}

function column(text: string): string {
  return `${text.padEnd(COLUMN)} `
}

/** 'hh:mm:ss' of a duration. */
export function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

/** verbose flags: `static`, `extended` (per-flow) or `none` (a simple dynamic row; UNVERIFIED wording). */
function flagsOf(row: NatTranslation): string {
  if (row.origin === 'static') return 'static'
  return row.protocol === 'any' ? 'none' : 'extended'
}

export class NatTranslationsView {
  /** Static rows first, then the dynamic rows alive at `now`. */
  static rows(nat: NatSettings | undefined, runtime: DeviceRuntime | undefined, now: number): NatTranslation[] {
    const statics = nat === undefined ? [] : NatConfig.staticRows(nat)
    return [...statics, ...NatRuntime.alive(NatRuntime.stored(runtime).translations, now)]
  }

  static lines(device: Device, runtime: DeviceRuntime | undefined, now: number, verbose: boolean): string[] {
    const rows = NatTranslationsView.rows(NatConfig.of(device), runtime, now)
    // An empty table prints nothing, header included (as Packet Tracer does; IOS UNVERIFIED).
    if (rows.length === 0) return []
    const lines = [HEADER]
    for (const row of rows) {
      const pro = row.protocol === 'any' ? NONE : row.protocol
      lines.push(`${pro} ${column(endpoint(row.insideGlobal))}${column(endpoint(row.insideLocal))}${column(endpoint(row.outsideLocal))}${endpoint(row.outsideGlobal)}`)
      if (verbose) lines.push(`        create ${clockOf(now - row.createdAt)}, use ${clockOf(now - row.lastUsedAt)}, flags: ${flagsOf(row)}`)
    }
    return lines
  }
}
