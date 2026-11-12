// Running-config output of the ACL set (docs/CLI.md §6, SECURITY_PACK.md §6): numbered lists as
// `access-list <n> …` lines, named lists as `ip access-list standard|extended <name>` blocks, and the
// interface line `ip access-group <acl> in|out`. Sequence numbers are never written (IOS); entries are
// written in sequence order, so a replay renumbers them 10, 20, … Every line is accepted by a command
// of this set (round trip in aclConfig.test.ts).
import type { AccessList } from '../../domain'
import type { InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { INTERFACE_LINE_ORDER, RUNNING_CONFIG_ORDER } from '../contract'
import { AclEdits } from './AclEdits'
import { AclInterfaces } from './AclInterfaces'
import { AclSyntax } from './AclSyntax'

function sorted(list: AccessList): AccessList['entries'] {
  return [...list.entries].sort((first, second) => first.seq - second.seq)
}

/** Numbered lists: one `access-list` line per entry. An empty numbered list has no line (IOS drops it). */
function numberedLines(lists: readonly AccessList[]): string[] {
  return lists.filter((list) => AclSyntax.isNumbered(list.name)).flatMap((list) => sorted(list).map((entry) => `access-list ${list.name} ${AclSyntax.entryText(entry)}`))
}

function namedBlock(list: AccessList): string[] {
  return [`ip access-list ${list.type} ${list.name}`, ...sorted(list).map((entry) => ` ${AclSyntax.entryText(entry)}`)]
}

const accessListSection: RunningConfigSection = {
  id: 'aclLists',
  order: RUNNING_CONFIG_ORDER.accessLists,
  blocks: (device) => {
    const lists = AclEdits.listsOf(device)
    const named = lists.filter((list) => !AclSyntax.isNumbered(list.name)).map(namedBlock)
    const numbered = numberedLines(lists)
    return [...named, ...(numbered.length === 0 ? [] : [numbered])]
  },
}

const accessGroupLines: InterfaceConfigContributor = {
  id: 'aclAccessGroup',
  order: INTERFACE_LINE_ORDER.features,
  lines: (_device, iface) => {
    const groups = AclInterfaces.l3Of(iface)?.features?.accessGroups
    if (groups === undefined) return []
    return [...(groups.in === undefined ? [] : [`ip access-group ${groups.in} in`]), ...(groups.out === undefined ? [] : [`ip access-group ${groups.out} out`])]
  },
}

export const aclConfigSections: readonly RunningConfigSection[] = [accessListSection]

export const aclInterfaceLines: readonly InterfaceConfigContributor[] = [accessGroupLines]
