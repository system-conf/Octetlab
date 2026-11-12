// `show users` and `show crypto key mypubkey rsa` (pack 5.2). Layouts follow IOS 15 output as quoted in
// Cisco Community posts (UNVERIFIED column widths). The lab's session is always the console one (scope A
// keeps no vty sessions open). The key data is a deterministic stand-in of the right length: no real
// key pair exists in the lab.
import type { Device } from '../../domain'
import { keyName } from './cryptoCommands'
import { RemoteEdits } from './RemoteEdits'

const HEX_GROUP = 8
const GROUPS_PER_LINE = 8
/** DER overhead of an RSA public key (sequence, algorithm id, exponent). */
const DER_OVERHEAD_BYTES = 38
const BITS_PER_BYTE = 8
const BYTE = 0xff

/** 32-bit FNV-1a step (stand-in key bytes, not cryptographic). */
function nextByte(state: number, index: number): number {
  return Math.imul(state ^ index, 0x01000193) >>> 0
}

export class RemoteShowViews {
  static users(): string[] {
    return [
      '    Line       User       Host(s)              Idle       Location',
      '*  0 con 0                idle                 00:00:00',
      '',
      '  Interface    User               Mode         Idle     Peer Address',
      '',
    ]
  }

  static mypubkey(device: Device): string[] {
    const bits = RemoteEdits.ssh(device).rsaKeyBits
    if (bits === undefined) return []
    const name = keyName(device)
    return [
      `Key name: ${name}`,
      ' Storage Device: not specified',
      ' Usage: General Purpose Key',
      ' Key is not exportable.',
      ' Key Data:',
      ...RemoteShowViews.keyData(name, bits),
    ]
  }

  /** Upper-case hex, 8 groups of 8 digits per line, like IOS. */
  private static keyData(name: string, bits: number): string[] {
    const bytes = bits / BITS_PER_BYTE + DER_OVERHEAD_BYTES
    let state = 0x811c9dc5
    for (const char of name) state = nextByte(state, char.charCodeAt(0))
    let hex = ''
    for (let index = 0; index < bytes; index += 1) {
      state = nextByte(state, index)
      hex += (state & BYTE).toString(16).toUpperCase().padStart(2, '0')
    }
    const groups = hex.match(new RegExp(`.{1,${HEX_GROUP}}`, 'g')) ?? []
    const lines: string[] = []
    for (let index = 0; index < groups.length; index += GROUPS_PER_LINE) lines.push(`  ${groups.slice(index, index + GROUPS_PER_LINE).join(' ')}`)
    return lines
  }
}
