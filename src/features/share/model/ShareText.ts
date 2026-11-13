// Cleans user text of a share page (title, author, description) at the boundary, before it is
// stored, hashed or shown. Output is plain text; every renderer escapes it again for its context.

/** C0 / C1 control characters except tab and line feed, plus bidi controls (text spoofing). */
// Matching control characters is the point of this pattern.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g
/** Characters that never belong in a one-line text and are unsafe in hand-built markup. */
const MARKUP = /[<>]/g

export class ShareText {
  /** One line: control characters and `<` `>` removed, whitespace runs collapsed, trimmed, NFC. */
  static line(text: string): string {
    return text.normalize('NFC').replace(CONTROL, '').replace(MARKUP, '').replace(/\s+/g, ' ').trim()
  }

  /** Several paragraphs: like line() per line, at most two consecutive line breaks kept. */
  static paragraphs(text: string): string {
    return text
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(CONTROL, '').replace(MARKUP, '').replace(/[^\S\n]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  /** At most `max` characters (code points, so no half emoji), with an ellipsis when cut. */
  static shorten(text: string, max: number): string {
    const chars = Array.from(text)
    if (chars.length <= max) return text
    return `${chars.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`
  }
}

/**
 * A LinkedIn profile URL in canonical form (`https://www.linkedin.com/in/<handle>`), or null when
 * the input is not one. Only https and linkedin.com hosts pass, so the page never links elsewhere.
 */
export function canonicalLinkedInUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (!/^([a-z]{2,3}\.)?linkedin\.com$/.test(url.hostname)) return null
  const match = /^\/in\/([A-Za-z0-9\-_%]{3,100})\/?$/.exec(url.pathname)
  if (match === null || match[1] === undefined) return null
  return `https://www.linkedin.com/in/${match[1]}`
}
