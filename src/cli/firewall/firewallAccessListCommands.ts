// Appliance-style access lists (docs/FIREWALL_PACK.md §6.2), stored as ordinary pack 5.2 AccessList data:
//   access-list <name> extended permit|deny <proto> <src> [port] <dst> [port] [icmp-type]   (netmask syntax)
//   access-list <name> standard permit|deny <address> <netmask> | host <ip> | any
//   access-list <name> remark <text>
//   no access-list <name>                 deletes the list
//   no access-list <name> extended …      deletes the matching entry
// Merged with the IOS `access-list <number>` of the ACL set: on a firewall a number is still read as an
// IOS numbered list (parameters are tried in registration order), so appliance-style names must not start
// with a digit. Running-config keeps the IOS named-list form of the ACL set (`ip access-list extended …`),
// which the firewall accepts as well; that set owns the section (85).
import type { AccessListType, AclAction } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { AclEdits, type AclEntryDraft } from '../acl/AclEdits'
import { AclRuleParser } from '../acl/AclRuleParser'
import { keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { NetmaskAclTranslator } from './NetmaskAclTranslator'
import { FIREWALL_ERRORS, isFirewall } from './firewallMessages'

const NAME_PATTERN = /^[A-Za-z_][\w.-]{0,63}$/
const MAX_REMARK = 100

function listName(ctx: CliContext): string | null {
  const name = ctx.args.text('name')
  return NAME_PATTERN.test(name) ? name : null
}

function draftOf(ctx: CliContext, type: AccessListType, action: AclAction): { readonly draft: AclEntryDraft } | { readonly error: string } {
  const words = ctx.args.text('rule').trim().split(/\s+/)
  const translated = NetmaskAclTranslator.translate(words)
  if (!translated.ok) return { error: translated.error }
  const parsed = AclRuleParser.parse(type, `${action} ${translated.text}`)
  return parsed.ok ? { draft: parsed.draft } : { error: FIREWALL_ERRORS.badAclEntry(parsed.text ?? parsed.problem) }
}

function addEntry(ctx: CliContext, type: AccessListType, draft: AclEntryDraft): CliCommandResult {
  const name = listName(ctx)
  if (name === null) return { lines: cliError(FIREWALL_ERRORS.badAclName(ctx.args.text('name'))) }
  const existing = AclEdits.find(ctx.device, name)
  if (existing !== undefined && existing.type !== type && draft.kind !== 'remark') return { lines: cliError(FIREWALL_ERRORS.aclTypeConflict) }
  const result = AclEdits.add(ctx.device, name, existing?.type ?? type, draft)
  return result.ok ? { device: result.device } : { lines: cliError(result.error) }
}

function ruleHandlers(type: AccessListType, action: AclAction): Pick<CliNode, 'run' | 'runNo'> {
  return {
    run: (ctx) => {
      const result = draftOf(ctx, type, action)
      return 'error' in result ? { lines: cliError(result.error) } : addEntry(ctx, type, result.draft)
    },
    runNo: (ctx) => {
      const result = draftOf(ctx, type, action)
      if ('error' in result) return { lines: cliError(result.error) }
      return { device: AclEdits.removeMatching(ctx.device, ctx.args.text('name'), result.draft) }
    },
  }
}

function typeNode(type: AccessListType, help: string): CliNode {
  const action = (word: AclAction, actionHelp: string): CliNode =>
    keyword(word, actionHelp, { children: [param('rule', { type: 'line', label: 'LINE' }, 'Protocol, source, destination (address netmask | host | any)', ruleHandlers(type, word))] })
  return keyword(type, help, { children: [action('deny', 'Specify packets to reject'), action('permit', 'Specify packets to forward')] })
}

function addRemark(ctx: CliContext): CliCommandResult {
  const text = ctx.args.text('remark')
  if (text.length > MAX_REMARK) return { lines: cliError(`% Remark is longer than ${MAX_REMARK} characters`) }
  return addEntry(ctx, 'extended', { kind: 'remark', text })
}

function deleteList(ctx: CliContext): CliCommandResult {
  return { device: AclEdits.remove(ctx.device, ctx.args.text('name')) }
}

const remarkNode = keyword('remark', 'Access list entry comment', {
  children: [param('remark', { type: 'line', label: 'LINE' }, `Comment up to ${MAX_REMARK} characters`, { run: addRemark, runNo: deleteList })],
})

export const firewallAccessListCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('access-list', 'Add an access list entry', {
      when: isFirewall,
      children: [
        param('name', { type: 'word', label: 'WORD' }, 'Access list name', {
          runNo: deleteList,
          children: [typeNode('extended', 'Extended access list'), remarkNode, typeNode('standard', 'Standard access list')],
        }),
      ],
    }),
  },
]
