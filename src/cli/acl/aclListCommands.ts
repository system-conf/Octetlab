// ACL definition commands (pack 5.2, docs/SECURITY_PACK.md §7):
//   access-list <n> permit|deny|remark …      numbered lists (`no access-list <n> …` deletes the whole list, as IOS)
//   ip access-list standard|extended <name>    → (config-std-nacl)# / (config-ext-nacl)#
//   [<seq>] permit|deny …, remark, no <seq>     in the sub-mode
//   ip access-list resequence <name> [<start> [<step>]]
// Error texts not found in a Cisco page are marked UNVERIFIED next to their constant.
import type { AccessListType } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliKeywordNode, CliNode } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { AclEdits, type AclEntryDraft } from './AclEdits'
import { AclRuleTree, type AclRuleSink } from './aclRuleTree'
import { AclSyntax, MAX_SEQ, SEQ_STEP } from './AclSyntax'

/** UNVERIFIED: IOS-XE wording when `ip access-list extended X` names an existing standard list (and back). */
const TYPE_CONFLICT = '% Access-list type conflicts with existing type'
/** UNVERIFIED: a numeric name outside the type's range, or a name that starts with a digit. */
const INVALID_NAME = '% Invalid access list name.'
/** Lab text (IOS gives no message we could confirm for an unknown list). */
const NO_SUCH_LIST = (name: string): string => `% Access list ${name} does not exist`
/** A standard form typed in an extended list or back (IOS rejects it as unknown input; no caret here). */
const WRONG_FORM = "% Invalid input detected at '^' marker."
const MAX_REMARK = 100
const REMARK_TOO_LONG = `% Remark is longer than ${MAX_REMARK} characters`

function added(ctx: CliContext, name: string, type: AccessListType, draft: AclEntryDraft, seq?: number): CliCommandResult {
  const existing = AclEdits.find(ctx.device, name)
  if (existing !== undefined && existing.type !== type) return { lines: cliError(TYPE_CONFLICT) }
  const result = AclEdits.add(ctx.device, name, type, draft, seq)
  return result.ok ? { device: result.device } : { lines: cliError(result.error) }
}

function remark(ctx: CliContext, apply: (draft: AclEntryDraft) => CliCommandResult): CliCommandResult {
  const text = ctx.args.text('remark')
  if (text.length > MAX_REMARK) return { lines: cliError(REMARK_TOO_LONG) }
  return apply({ kind: 'remark', text })
}

// ---------------------------------------------------------------- access-list <n>

function numberedName(ctx: CliContext): string {
  return String(ctx.args.number('list'))
}

function deleteNumbered(ctx: CliContext): CliCommandResult {
  return { device: AclEdits.remove(ctx.device, numberedName(ctx)) }
}

function numberedSink(type: AccessListType): AclRuleSink {
  return {
    add: (ctx, draft) => added(ctx, numberedName(ctx), type, draft),
    // IOS: `no access-list 10 permit …` removes the whole list, not one entry.
    remove: (ctx) => deleteNumbered(ctx),
  }
}

function numberedRange(min: number, max: number, help: string, type: AccessListType): CliNode {
  const sink = numberedSink(type)
  return param('list', { type: 'number', min, max }, help, {
    runNo: deleteNumbered,
    children: [
      ...AclRuleTree.actions(sink, type),
      keyword('remark', 'Access list entry comment', {
        children: [
          param('remark', { type: 'line', label: 'LINE' }, `Comment up to ${MAX_REMARK} characters`, {
            run: (ctx) => remark(ctx, (draft) => sink.add(ctx, draft)),
            runNo: deleteNumbered,
          }),
        ],
      }),
    ],
  })
}

// ---------------------------------------------------------------- ip access-list standard|extended <name>

function validName(name: string, type: AccessListType): boolean {
  if (AclSyntax.isNumbered(name)) return AclSyntax.numberedType(name) === type
  return !/^\d/.test(name)
}

function enterList(ctx: CliContext, type: AccessListType): CliCommandResult {
  const name = ctx.args.text('name')
  if (!validName(name, type)) return { lines: cliError(INVALID_NAME) }
  const existing = AclEdits.find(ctx.device, name)
  if (existing !== undefined && existing.type !== type) return { lines: cliError(TYPE_CONFLICT) }
  return { device: AclEdits.ensure(ctx.device, name, type), mode: { kind: 'accessList', listType: type, name } }
}

function deleteNamed(ctx: CliContext, type: AccessListType): CliCommandResult {
  const name = ctx.args.text('name')
  const existing = AclEdits.find(ctx.device, name)
  if (existing === undefined || existing.type !== type) return {}
  return { device: AclEdits.remove(ctx.device, name) }
}

function resequence(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('name')
  if (AclEdits.find(ctx.device, name) === undefined) return { lines: cliError(NO_SUCH_LIST(name)) }
  const start = ctx.args.has('start') ? ctx.args.number('start') : SEQ_STEP
  const step = ctx.args.has('step') ? ctx.args.number('step') : SEQ_STEP
  const result = AclEdits.resequence(ctx.device, name, start, step)
  return result.ok ? { device: result.device } : { lines: cliError(result.error) }
}

function listKeyword(type: AccessListType, help: string): CliNode {
  return keyword(type, help, {
    children: [param('name', { type: 'word', label: 'WORD' }, 'Access-list name or number', { run: (ctx) => enterList(ctx, type), runNo: (ctx) => deleteNamed(ctx, type) })],
  })
}

// ---------------------------------------------------------------- the (config-std-nacl) / (config-ext-nacl) sub-mode

function currentList(ctx: CliContext): { readonly name: string; readonly type: AccessListType } {
  if (ctx.mode.kind !== 'accessList') throw new Error('Access-list entry outside the access-list mode')
  return { name: ctx.mode.name, type: ctx.mode.listType }
}

const subModeSink: AclRuleSink = {
  add: (ctx, draft) => {
    const { name, type } = currentList(ctx)
    if (!accepts(draft, type)) return { lines: cliError(WRONG_FORM) }
    return added(ctx, name, type, draft, ctx.args.has('seq') ? ctx.args.number('seq') : undefined)
  },
  remove: (ctx, draft) => {
    const { name } = currentList(ctx)
    if (ctx.args.has('seq')) return { device: AclEdits.removeSeq(ctx.device, name, ctx.args.number('seq')) }
    return { device: AclEdits.removeMatching(ctx.device, name, draft) }
  },
}

function remarkNode(): CliKeywordNode {
  return keyword('remark', 'Access list entry comment', {
    children: [
      param('remark', { type: 'line', label: 'LINE' }, `Comment up to ${MAX_REMARK} characters`, {
        run: (ctx) => remark(ctx, (draft) => subModeSink.add(ctx, draft)),
        runNo: (ctx) => remark(ctx, (draft) => subModeSink.remove(ctx, draft)),
      }),
    ],
  })
}

/**
 * `permit` / `deny` of the sub-mode. Both list types share the mode kind and the tree is per mode kind, so
 * the keyword offers the standard forms (any / host / A.B.C.D) and the extended protocols side by side;
 * the sink refuses the other type's form like IOS refuses unknown input.
 */
function subModeActions(): CliKeywordNode[] {
  const standard = AclRuleTree.actions(subModeSink, 'standard')
  const extended = AclRuleTree.actions(subModeSink, 'extended')
  return standard.map((node) => {
    const other = extended.find((candidate) => candidate.word === node.word)
    return { ...node, children: [...(node.children ?? []), ...(other?.children ?? [])] }
  })
}

const subModeNodes = [...subModeActions(), remarkNode()]

function removeSeq(ctx: CliContext): CliCommandResult {
  return { device: AclEdits.removeSeq(ctx.device, currentList(ctx).name, ctx.args.number('seq')) }
}

const seqNode = param('seq', { type: 'number', min: 1, max: MAX_SEQ }, 'Sequence Number', { runNo: removeSeq, children: subModeNodes })

function accepts(entry: AclEntryDraft, type: AccessListType): boolean {
  return entry.kind === 'remark' || entry.kind === type
}

export const aclListCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('access-list', 'Add an access list entry', {
      when: CliWhens.routing,
      children: [
        numberedRange(1, 99, 'IP standard access list', 'standard'),
        numberedRange(100, 199, 'IP extended access list', 'extended'),
        numberedRange(1300, 1999, 'IP standard access list (expanded range)', 'standard'),
        numberedRange(2000, 2699, 'IP extended access list (expanded range)', 'extended'),
      ],
    }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', {
      children: [
        keyword('access-list', 'Named access list', {
          when: CliWhens.routing,
          children: [
            listKeyword('extended', 'Extended Access List'),
            keyword('resequence', 'Resequence Access List', {
              children: [
                param('name', { type: 'word', label: 'WORD' }, 'Access-list name or number', {
                  run: resequence,
                  children: [
                    param('start', { type: 'number', min: 1, max: MAX_SEQ }, 'Starting Sequence Number', {
                      run: resequence,
                      children: [param('step', { type: 'number', min: 1, max: MAX_SEQ }, 'Step to increment the sequence number', { run: resequence })],
                    }),
                  ],
                }),
              ],
            }),
            listKeyword('standard', 'Standard Access List'),
          ],
        }),
      ],
    }),
  },
  ...subModeNodes.map((node): CliCommandRegistration => ({ modes: ['accessList'], node })),
]

/**
 * `<seq> permit|deny|remark …` and `no <seq>` of the sub-mode: a line that starts with a number. NOT
 * registered yet: CliCommandRegistration.node is a keyword (cli/contract) and CliRegistry keeps keyword
 * roots only, so a parameter root needs a coordinator change there. Ready to register as
 * `{ modes: ['accessList'], node: aclSequenceRoot }` once roots may be parameters.
 */
export const aclSequenceRoot = seqNode
