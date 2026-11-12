// `crypto key generate rsa [general-keys] [modulus n]` and `crypto key zeroize rsa` (pack 5.2). The key
// pair is only its modulus here (`ssh.rsaKeyBits`): no real key is made, and it survives `reload`.
// Texts: https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html (generation
// lines). "% Please define a domain-name first." and the interactive modulus prompt are the widely quoted
// IOS 12.x / 15.x texts (UNVERIFIED against an official page).
import type { Device } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode, CliQuestion } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError, cliLog, cliText } from '../core/CliOutput'
import { CliPrompt, managementOf } from '../core/CliPrompt'
import { RemoteEdits } from './RemoteEdits'
import { SshStatusView } from './SshStatusView'

export const MIN_MODULUS = 360
export const MAX_MODULUS = 4096
const DEFAULT_MODULUS = 512
const BITS_PER_SECOND = 1024

/** `hostname.domain`, the name IOS gives the key pair. */
export function keyName(device: Device): string {
  return `${CliPrompt.hostname(device)}.${managementOf(device).domainName ?? ''}`
}

/** What stops key generation: the factory hostname, or no domain name. */
function prerequisiteError(device: Device): CliCommandResult | null {
  if (CliPrompt.hostname(device) === CliPrompt.factoryHostname(device)) {
    return { lines: cliError(`% Please define a hostname other than ${CliPrompt.factoryHostname(device)}.`) }
  }
  if (managementOf(device).domainName === undefined) return { lines: cliError('% Please define a domain-name first.') }
  return null
}

function generated(ctx: CliContext, bits: number, announceSize: boolean): CliCommandResult {
  const wasEnabled = SshStatusView.enabled(ctx.device)
  const device = RemoteEdits.setSsh(ctx.device, 'rsaKeyBits', bits)
  const lines = cliText(
    ...(announceSize ? [`% The key modulus size is ${bits} bits`] : []),
    `% Generating ${bits} bit RSA keys, keys will be non-exportable...`,
    `[OK] (elapsed time was ${Math.max(1, Math.round(bits / BITS_PER_SECOND))} seconds)`,
    '',
  )
  const enabled = !wasEnabled && SshStatusView.enabled(device)
  return { device, lines: enabled ? [...lines, ...cliLog(`%SSH-5-ENABLED: SSH ${SshStatusView.versionText(device)} has been enabled`)] : lines }
}

const modulusQuestion: CliQuestion = {
  prompt: `How many bits in the modulus [${DEFAULT_MODULUS}]: `,
  secret: false,
  onAnswer: (answer, ctx) => {
    const text = answer.trim()
    const bits = text === '' ? DEFAULT_MODULUS : Number(text)
    if (!Number.isInteger(bits) || bits < MIN_MODULUS || bits > MAX_MODULUS) return { ask: modulusQuestion }
    return generated(ctx, bits, false)
  },
}

/** Interactive form: the size is asked (Enter = 512). */
function askModulus(): CliCommandResult {
  return {
    lines: cliText(
      `Choose the size of the key modulus in the range of ${MIN_MODULUS} to ${MAX_MODULUS} for your`,
      '  General Purpose Keys. Choosing a key modulus greater than 512 may take',
      '  a few minutes.',
      '',
    ),
    ask: modulusQuestion,
  }
}

/** Existing keys are replaced only after `yes` (Enter = no, so a replayed line never destroys keys). */
function replaceQuestion(next: () => CliCommandResult): CliQuestion {
  return {
    prompt: '% Do you really want to replace them? [yes/no]: ',
    secret: false,
    onAnswer: (answer) => (answer.trim().toLowerCase() === 'yes' ? next() : {}),
  }
}

function generate(ctx: CliContext): CliCommandResult {
  const blocked = prerequisiteError(ctx.device)
  if (blocked !== null) return blocked
  const bits = ctx.args.has('modulus') ? ctx.args.number('modulus') : null
  const name = cliText(`The name for the keys will be: ${keyName(ctx.device)}`)
  const next = (): CliCommandResult => {
    const result = bits === null ? askModulus() : generated(ctx, bits, true)
    return { ...result, lines: [...name, ...(result.lines ?? [])] }
  }
  if (RemoteEdits.ssh(ctx.device).rsaKeyBits === undefined) return next()
  return { lines: cliText(`% You already have RSA keys defined named ${keyName(ctx.device)}.`), ask: replaceQuestion(next) }
}

function zeroized(ctx: CliContext): CliCommandResult {
  const wasEnabled = SshStatusView.enabled(ctx.device)
  const device = RemoteEdits.setSsh(ctx.device, 'rsaKeyBits', undefined)
  return { device, lines: wasEnabled ? cliLog(`%SSH-5-DISABLED: SSH ${SshStatusView.versionText(ctx.device)} has been disabled`) : [] }
}

function zeroize(ctx: CliContext): CliCommandResult {
  if (RemoteEdits.ssh(ctx.device).rsaKeyBits === undefined) return {}
  return {
    lines: cliText('% All RSA keys will be removed.', '% All router certs issued using these keys will also be removed.'),
    ask: {
      prompt: 'Do you really want to remove these keys? [yes/no]: ',
      secret: false,
      onAnswer: (answer, answerCtx) => (answer.trim().toLowerCase() === 'yes' ? zeroized(answerCtx) : {}),
    },
  }
}

const modulusNode: CliNode = keyword('modulus', 'Provide number of modulus bits on the command line', {
  children: [param('modulus', { type: 'number', min: MIN_MODULUS, max: MAX_MODULUS }, 'size of the key modulus [360-4096]', { run: generate })],
})

export const cryptoCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('crypto', 'Encryption module', {
      children: [
        keyword('key', 'Long term key operations', {
          children: [
            keyword('generate', 'Generate new keys', {
              children: [
                keyword('rsa', 'Generate RSA keys', {
                  run: generate,
                  children: [keyword('general-keys', 'Generate a general purpose RSA key pair for signing and encryption', { run: generate, children: [modulusNode] }), modulusNode],
                }),
              ],
            }),
            keyword('zeroize', 'Remove keys', { children: [keyword('rsa', 'Remove RSA keys', { run: zeroize })] }),
          ],
        }),
      ],
    }),
  },
]
