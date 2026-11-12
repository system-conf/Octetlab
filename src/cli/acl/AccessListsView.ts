// `show access-lists` / `show ip access-lists [<acl>]` (pack 5.2, docs/SECURITY_PACK.md §7). Format of the
// Cisco command reference (https://www.cisco.com/E-Learning/bulk/public/tac/cim/cib/using_cisco_ios_software/cmdrefs/show_access-lists.htm):
//   Extended IP access list 101
//       10 permit tcp host 198.92.32.130 any established (4304 matches)
//       20 deny   ip 150.136.0.0 0.0.255.255 224.0.0.0 15.255.255.255
// The action is padded to six characters as in that sample. "Standard IP access list 10" and the
// singular "(1 match)" are UNVERIFIED (the header is quoted on community.cisco.com threads). Remarks are
// not shown (they only appear in running-config; UNVERIFIED).
import type { AccessList, AclEntry } from '../../domain'
import type { AclCounters } from '../../sim/contract/SecurityRuntime'
import { AclSyntax } from './AclSyntax'

const INDENT = '    '

function header(list: AccessList): string {
  return `${list.type === 'standard' ? 'Standard' : 'Extended'} IP access list ${list.name}`
}

function matches(count: number): string {
  if (count <= 0) return ''
  return count === 1 ? ' (1 match)' : ` (${count} matches)`
}

function entryLine(entry: Exclude<AclEntry, { kind: 'remark' }>, count: number): string {
  const text = AclSyntax.showText(entry)
  const padded = `${entry.action.padEnd(6)}${text.slice(entry.action.length)}`
  return `${INDENT}${entry.seq} ${padded}${matches(count)}`
}

export class AccessListsView {
  /** Every list, or only `only` (nothing when it does not exist). */
  static lines(lists: readonly AccessList[], counters: AclCounters | undefined, only: string | null): string[] {
    const shown = only === null ? lists : lists.filter((list) => list.name === only)
    return shown.flatMap((list) => {
      const own = counters?.[list.name] ?? {}
      const rules = [...list.entries]
        .sort((first, second) => first.seq - second.seq)
        .filter((entry): entry is Exclude<AclEntry, { kind: 'remark' }> => entry.kind !== 'remark')
      return [header(list), ...rules.map((entry) => entryLine(entry, own[entry.seq] ?? 0))]
    })
  }
}
