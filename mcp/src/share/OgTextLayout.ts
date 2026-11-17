// Text for the Open Graph picture: SVG has no text wrapping and the Worker cannot measure glyphs, so
// lines are broken by an estimated average glyph width of the bundled Inter font. Every string that
// leaves this class is XML-escaped (titles and names are user text).

/** Average advance of Inter (bold and medium) per font-size unit; slightly generous so lines fit. */
const AVERAGE_GLYPH_WIDTH = 0.58
const ELLIPSIS = '…'

export class OgTextLayout {
  /** How many characters of `fontSize` text fit into `width` pixels. */
  static capacity(width: number, fontSize: number): number {
    return Math.max(1, Math.floor(width / (fontSize * AVERAGE_GLYPH_WIDTH)))
  }

  /**
   * `text` broken into at most `maxLines` lines of at most `perLine` characters, at spaces where
   * possible; the last line ends with an ellipsis when text is left over. Not escaped.
   */
  static wrap(text: string, perLine: number, maxLines: number): string[] {
    const words = text.trim().split(/\s+/).filter((word) => word !== '')
    const lines: string[] = []
    let current = ''
    let index = 0
    while (index < words.length && lines.length < maxLines) {
      const word = words[index] ?? ''
      const candidate = current === '' ? word : `${current} ${word}`
      if (candidate.length <= perLine) {
        current = candidate
        index++
      } else if (current === '') {
        lines.push(word.slice(0, perLine))
        words[index] = word.slice(perLine)
      } else {
        lines.push(current)
        current = ''
      }
    }
    if (current !== '' && lines.length < maxLines) lines.push(current)
    if (index < words.length && lines.length > 0) {
      const last = lines.length - 1
      lines[last] = OgTextLayout.truncate(`${lines[last] ?? ''}${ELLIPSIS}`, perLine)
    }
    return lines
  }

  /** `text` cut to `max` characters, ending with an ellipsis when it was longer. Not escaped. */
  static truncate(text: string, max: number): string {
    const trimmed = text.trim()
    if (trimmed.length <= max) return trimmed
    return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}${ELLIPSIS}`
  }

  static escape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  }
}
