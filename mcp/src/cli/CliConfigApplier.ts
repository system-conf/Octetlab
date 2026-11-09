// apply_cli_config: IOS configuration lines on a router / switch, typed into an enabled console line
// by line (like pasting into the web app's CLI), so every rejected line is reported with its error.
// Lines that need the simulator (`do ping`) are cancelled: run_command runs them.
import { DeviceConfigText } from '../../../src/cli/config/DeviceConfigText'
import { CONFIG_SUBMODE_KINDS, type CliSessionState, type CliStep } from '../../../src/cli/contract'
import type { Device, LabDocument } from '../../../src/domain'
import { ToolError } from '../errors/ToolError'
import type { DeviceAccess } from '../lab/DeviceAccess'
import type { EnglishMessages } from '../text/EnglishMessages'
import { ConsoleSession } from './ConsoleSession'

export const MAX_CONFIG_LINES = 500

/** First words that already leave privileged EXEC on their own (else `configure terminal` is typed first). */
const SESSION_STARTERS = /^(en|ena|enab|enabl|enable|conf|confi|config|configu|configur|configure)(\s|$)/i

/** Blank lines and the `^` marker line under the typed command (it points into the echo, which the report omits). */
const CARET_ONLY = /^\s*\^?\s*$/

export interface ConfigLineError {
  line: string
  error: string
}

export interface ConfigResult {
  doc: LabDocument
  device: Device
  errors: ConfigLineError[]
  /** Console output of the accepted lines (log messages such as %LINK-3-UPDOWN). */
  notes: string[]
  runningConfig: string[]
}

export class CliConfigApplier {
  private readonly devices: DeviceAccess
  private readonly messages: EnglishMessages

  constructor(devices: DeviceAccess, messages: EnglishMessages) {
    this.devices = devices
    this.messages = messages
  }

  apply(doc: LabDocument, deviceId: string, text: string): ConfigResult {
    const original = this.devices.require(doc, deviceId)
    if (!DeviceConfigText.hasCli(original)) {
      throw ToolError.validation(`${original.id} (${original.modelId}) has no IOS command line. Use configure_host for end devices; unmanaged switches and hubs have no settings.`)
    }
    if (!original.powered) throw ToolError.refused(`${original.id} is powered off. Turn it on with set_power first.`)
    const lines = text.split('\n').map((line) => line.replace(/\r$/, ''))
    if (lines.length > MAX_CONFIG_LINES) throw ToolError.limit(`At most ${MAX_CONFIG_LINES} lines per call (got ${lines.length}). Split the configuration.`)

    const shell = ConsoleSession.shell
    let device = original
    let state: CliSessionState = ConsoleSession.state(device, { kind: 'privilegedExec' })
    const errors: ConfigLineError[] = []
    const notes: string[] = []
    const typed = this.withConfigureTerminal(lines)
    for (const line of typed) {
      const step = this.submit(doc, state, device, line)
      const settled = this.withoutJob(step, device, line, errors)
      device = settled.device ?? device
      state = settled.state
      const output = this.messages.lines(settled.lines.filter((out) => out.kind !== 'error')).filter((out) => out.trim() !== '')
      const failed = settled.lines.filter((out) => out.kind === 'error').map((out) => this.messages.line(out)).filter((out) => !CARET_ONLY.test(out))
      if (failed.length > 0) errors.push({ line, error: failed.join(' ') })
      notes.push(...output)
    }
    if (state.pending?.kind === 'question') errors.push({ line: '(end of input)', error: `A question is still waiting for an answer: ${state.pending.question.prompt}` })

    const next = device === original ? doc : this.devices.update(doc, device)
    return { doc: next, device, errors, notes, runningConfig: shell.runningConfig(device) }
  }

  /**
   * One line. Like IOS, a line a config sub-mode rejects is tried again in global config (e.g.
   * `ip dhcp pool LAN` right after an interface block, without `exit`).
   */
  private submit(doc: LabDocument, state: CliSessionState, device: Device, line: string): CliStep {
    const shell = ConsoleSession.shell
    const step = shell.submit(state, device, ConsoleSession.environment(doc.state, device), line)
    const inSubMode = state.pending === null && CONFIG_SUBMODE_KINDS.includes(state.mode.kind)
    if (!inSubMode || !step.lines.some((out) => out.kind === 'error')) return step
    const global = shell.submit({ ...state, mode: { kind: 'globalConfig' } }, device, ConsoleSession.environment(doc.state, device), line)
    return global.lines.some((out) => out.kind === 'error') ? step : global
  }

  /** Types `configure terminal` first unless the text starts with `enable` / `configure …` itself. */
  private withConfigureTerminal(lines: readonly string[]): string[] {
    const first = lines.find((line) => line.trim() !== '' && !line.trim().startsWith('!'))
    if (first === undefined) return []
    const meaningful = lines.filter((line) => line.trim() !== '' && !line.trim().startsWith('!'))
    return SESSION_STARTERS.test(first.trim()) ? meaningful : ['configure terminal', ...meaningful]
  }

  /** A line that started a simulator job is cancelled (Ctrl+C) and reported. */
  private withoutJob(step: CliStep, device: Device, line: string, errors: ConfigLineError[]): CliStep {
    if (step.job === undefined) return step
    errors.push({ line, error: 'Not run: this command needs the network simulation. Use run_command for ping / traceroute.' })
    const cancelled = ConsoleSession.shell.control(step.state, step.device ?? device, 'ctrlC')
    return step.device === undefined ? cancelled : { ...cancelled, device: step.device }
  }
}
