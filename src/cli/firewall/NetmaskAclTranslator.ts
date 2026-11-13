// Appliance ACL syntax → IOS ACL syntax. Appliances write address ranges with a netmask
// ("10.0.0.0 255.255.255.0") where IOS writes a wildcard ("10.0.0.0 0.0.0.255"), and accept `any4` for
// `any`; everything else (protocols, `host`, port operators, ICMP names) is the same text. The result
// goes through the pack 5.2 parser (AclRuleParser), so both syntaxes end in the same AccessList data.
import { Ipv4 } from '../../net/Ipv4'
import { FIREWALL_ERRORS } from './firewallMessages'

export type TranslatedRule = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string }

const ALL_ONES = 0xffffffff

function isMask(text: string): boolean {
  return text === '0.0.0.0' || Ipv4.isValidMask(text)
}

export class NetmaskAclTranslator {
  /** The words after `permit` / `deny`, rewritten with wildcards. */
  static translate(words: readonly string[]): TranslatedRule {
    const out: string[] = []
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index] ?? ''
      const lower = word.toLowerCase()
      if (lower === 'any4') {
        out.push('any')
        continue
      }
      if (lower === 'host') {
        out.push(lower, words[index + 1] ?? '')
        index += 1
        continue
      }
      const next = words[index + 1]
      if (Ipv4.parse(word) === null || next === undefined || Ipv4.parse(next) === null) {
        out.push(word)
        continue
      }
      if (!isMask(next)) return { ok: false, error: FIREWALL_ERRORS.badMask(next) }
      const wildcard = Ipv4.format((ALL_ONES - (Ipv4.parse(next) ?? 0)) >>> 0)
      out.push(word, wildcard)
      index += 1
    }
    return { ok: true, text: out.join(' ').trim() }
  }

  /** IOS wildcard → netmask ('0.0.0.255' → '255.255.255.0'), for appliance-style output. */
  static maskOf(wildcard: string): string {
    return Ipv4.format((ALL_ONES - (Ipv4.parse(wildcard) ?? 0)) >>> 0)
  }
}
