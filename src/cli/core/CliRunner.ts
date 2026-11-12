// Runs parsed lines and applies handler results to the session (docs/CLI.md §4): sub-mode fallback to
// global config, `do`, interface ranges, questions and simulator jobs.
import type { Device, TerminalLine } from '../../domain'
import type { RequestRecord, SimRequest } from '../../sim/contract'
import type {
  CliArgsReader,
  CliCommandResult,
  CliContext,
  CliEnvironment,
  CliHandler,
  CliMode,
  CliResumePoint,
  CliSessionState,
} from '../contract'
import { CONFIG_SUBMODE_KINDS, EXEC_MODE_KINDS } from '../contract'
import { CliErrors } from './CliErrors'
import { CliHistory } from './CliHistory'
import { cliError } from './CliOutput'
import type { CliParser, WalkState } from './CliParser'
import { CliPrompt, managementOf } from './CliPrompt'
import { CliTokenizer } from './CliTokenizer'
import { DeviceInterfaces } from './DeviceInterfaces'

/** What a command did to the session and the device. */
export interface RunOutcome {
  readonly state: CliSessionState
  readonly device: Device
  readonly changed: boolean
  readonly lines: readonly TerminalLine[]
  readonly job?: SimRequest
  readonly reloaded: boolean
}

const PRIVILEGED: CliMode = { kind: 'privilegedExec' }
const GLOBAL_CONFIG: CliMode = { kind: 'globalConfig' }

export class CliRunner {
  private readonly parser: CliParser

  constructor(parser: CliParser) {
    this.parser = parser
  }

  /** A fresh outcome (nothing done yet). */
  static start(state: CliSessionState, device: Device): RunOutcome {
    return { state, device, changed: false, lines: [], reloaded: false }
  }

  /** The mode, or global config when the GUI removed the interface the mode points at. */
  static validMode(device: Device, mode: CliMode): CliMode {
    switch (mode.kind) {
      case 'interface':
        return DeviceInterfaces.find(device, mode.interfaceId) === undefined ? GLOBAL_CONFIG : mode
      case 'subInterface': {
        const parentId = mode.interfaceId.slice(0, mode.interfaceId.lastIndexOf('.'))
        return DeviceInterfaces.find(device, parentId)?.kind === 'port' ? mode : GLOBAL_CONFIG
      }
      case 'interfaceRange':
        return mode.interfaceIds.every((id) => DeviceInterfaces.find(device, id) !== undefined) ? mode : GLOBAL_CONFIG
      default:
        return mode
    }
  }

  /** Runs one command line typed after a prompt of `promptLength` characters. */
  execute(outcome: RunOutcome, env: CliEnvironment, line: string, promptLength: number): RunOutcome {
    const tokens = CliTokenizer.tokenize(line)
    if (tokens.length === 0) return outcome
    const { device } = outcome
    let mode = outcome.state.mode
    let parsed = this.parser.parse(line, mode.kind, device)
    if ((parsed.kind === 'invalid' || parsed.kind === 'incomplete') && CONFIG_SUBMODE_KINDS.includes(mode.kind)) {
      // IOS: a command the sub-mode does not know runs in global config and leaves the sub-mode, also
      // when the sub-mode knows its first words (`ip route` / `ip nat pool` after an interface block).
      // A line global config rejects too keeps the sub-mode's own error.
      const retry = this.parser.parse(line, 'globalConfig', device)
      if (retry.kind === 'ok') {
        parsed = retry
        mode = GLOBAL_CONFIG
      }
    }
    const base: RunOutcome = { ...outcome, state: { ...outcome.state, mode } }
    switch (parsed.kind) {
      case 'empty':
        return base
      case 'ambiguous':
        return this.withLines(base, cliError(...CliErrors.ambiguous(line)))
      case 'incomplete':
        return this.withLines(base, cliError(...CliErrors.incomplete()))
      case 'invalid': {
        const [only] = tokens
        if (tokens.length === 1 && only !== undefined && EXEC_MODE_KINDS.includes(mode.kind)) {
          return this.withLines(base, cliError(...CliErrors.unknownHost(only.text, managementOf(device).domainLookup !== false)))
        }
        return this.withLines(base, cliError(...CliErrors.invalid(promptLength + parsed.at)))
      }
      case 'ok':
        return this.run(base, env, parsed.handler, parsed.state)
    }
  }

  /** The answer to the pending question. */
  answer(outcome: RunOutcome, env: CliEnvironment, answer: string): RunOutcome {
    const pending = outcome.state.pending
    if (pending?.kind !== 'question') return outcome
    const cleared = { ...outcome, state: { ...outcome.state, pending: null } }
    const result = pending.question.onAnswer(answer, this.context(cleared, env, pending.resume))
    return this.apply(cleared, result, pending.resume)
  }

  /** The pending job's request finished. A record of another request is ignored. */
  finishJob(outcome: RunOutcome, env: CliEnvironment, record: RequestRecord): RunOutcome {
    const pending = outcome.state.pending
    if (pending?.kind !== 'job') return outcome
    const cleared = { ...outcome, state: { ...outcome.state, pending: null } }
    return this.apply(cleared, pending.job.onDone(record, this.context(cleared, env, pending.resume)), pending.resume)
  }

  /** Applies a handler result: output, device, mode, session effects, then a question or a job. */
  apply(outcome: RunOutcome, result: CliCommandResult, resume: CliResumePoint): RunOutcome {
    let state = outcome.state
    let { reloaded } = outcome
    const lines = [...outcome.lines, ...(result.lines ?? [])]
    if (result.mode !== undefined) state = { ...state, mode: result.mode }
    const effect = result.session
    if (effect?.kind === 'terminalLength') state = { ...state, terminalLength: effect.length }
    if (effect?.kind === 'logout' || effect?.kind === 'reloaded') {
      state = { ...state, mode: { kind: 'userExec' }, phase: 'pressReturn', pending: null }
      reloaded ||= effect.kind === 'reloaded'
    }
    const device = result.device ?? outcome.device
    const changed = outcome.changed || result.device !== undefined
    if (result.ask !== undefined) {
      return { ...outcome, state: { ...state, pending: { kind: 'question', question: result.ask, resume } }, device, changed, lines, reloaded }
    }
    if (result.job !== undefined) {
      const pending = { kind: 'job' as const, job: result.job, resume }
      return { state: { ...state, pending }, device, changed, lines, job: result.job.request, reloaded }
    }
    return { ...outcome, state, device, changed, lines, reloaded }
  }

  private run(outcome: RunOutcome, env: CliEnvironment, handler: CliHandler, walk: WalkState): RunOutcome {
    const mode = outcome.state.mode
    const point = (runMode: CliMode): CliResumePoint => ({ mode: runMode, args: walk.args, path: walk.path, negated: walk.negated })
    if (walk.viaDo) {
      // `do`: an EXEC command from config mode; the mode never changes.
      const result = handler(this.context(outcome, env, point(PRIVILEGED)))
      return this.apply(outcome, { ...result, mode: undefined }, point(PRIVILEGED))
    }
    if (mode.kind !== 'interfaceRange') return this.apply(outcome, handler(this.context(outcome, env, point(mode))), point(mode))
    let current = outcome
    for (const interfaceId of mode.interfaceIds) {
      const member: CliMode = { kind: 'interface', interfaceId }
      const result = handler(this.context(current, env, point(member)))
      current = this.apply(current, result, point(member))
      if (result.mode !== undefined || result.ask !== undefined || result.job !== undefined || result.session !== undefined) break
    }
    return current
  }

  private context(outcome: RunOutcome, env: CliEnvironment, point: CliResumePoint): CliContext {
    const { device, state } = outcome
    return {
      device,
      mode: point.mode,
      args: point.args satisfies CliArgsReader,
      path: point.path,
      negated: point.negated,
      env,
      session: {
        hostname: CliPrompt.hostname(device),
        terminalLength: state.terminalLength,
        history: CliHistory.of(state),
      },
    }
  }

  private withLines(outcome: RunOutcome, lines: readonly TerminalLine[]): RunOutcome {
    return { ...outcome, lines: [...outcome.lines, ...lines] }
  }
}
