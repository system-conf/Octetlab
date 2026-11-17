// The Open Graph picture of a share page (docs/SHARE_PAGES.md §7) as SVG, rasterised to PNG by the
// share store with the bundled Inter font (mcp/src/share/fonts, SIL OFL). The lab title sits on top,
// the topology in the middle and the brand plus the author's name in the bottom strip, so a link
// preview stays readable without its surrounding text. User text is escaped by OgTextLayout.
import type { LabDocument } from '../../../src/domain'
import { ShareTopology, type NodeGroup, type TopologyFrame } from '../../../src/features/share/model/ShareTopology'
import { OgTextLayout } from './OgTextLayout'

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const
/** Family name of the bundled fonts; the renderer registers them under it. */
export const OG_FONT_FAMILY = 'Inter'

/** The words on the picture: the share's title and (optional, may be '') author. */
export interface OgImageText {
  title: string
  author: string
}

const FILL: Readonly<Record<NodeGroup, string>> = {
  internet: '#f59e0b',
  router: '#38bdf8',
  switch: '#34d399',
  wireless: '#a78bfa',
  endpoint: '#e2e8f0',
}

const BRAND_STRIP = 110
const SIDE = 90
const TITLE_SIZE = 52
const TITLE_LEADING = 62
const TITLE_TOP = 108
const AUTHOR_SIZE = 26

export class OgImageSvg {
  static build(doc: LabDocument, text: OgImageText): string {
    const title = OgTextLayout.wrap(text.title, OgTextLayout.capacity(OG_IMAGE_SIZE.width - 2 * SIDE, TITLE_SIZE), 2)
    const titleBottom = TITLE_TOP + (title.length - 1) * TITLE_LEADING
    const frame = ShareTopology.fit(doc, {
      ...OG_IMAGE_SIZE,
      padding: { top: titleBottom + 70, right: SIDE, bottom: BRAND_STRIP + 40, left: SIDE },
    })
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" font-family="${OG_FONT_FAMILY}">`,
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#0c4a6e"/></linearGradient></defs>',
      `<rect width="${frame.width}" height="${frame.height}" fill="url(#bg)"/>`,
      OgImageSvg.grid(frame),
      ...OgImageSvg.edges(frame),
      ...OgImageSvg.nodes(frame),
      OgImageSvg.title(title),
      OgImageSvg.brand(frame, text.author),
      '</svg>',
    ].join('')
  }

  private static grid(frame: TopologyFrame): string {
    const lines: string[] = []
    for (let x = 40; x < frame.width; x += 40) lines.push(`M${x} 0V${frame.height - BRAND_STRIP}`)
    for (let y = 40; y < frame.height - BRAND_STRIP; y += 40) lines.push(`M0 ${y}H${frame.width}`)
    return `<path d="${lines.join('')}" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>`
  }

  private static edges(frame: TopologyFrame): string[] {
    const width = Math.max(2, Math.round(frame.radius / 5))
    return frame.edges.map(
      (edge) =>
        `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="#94a3b8" stroke-opacity="0.85" stroke-width="${width}" stroke-linecap="round"${edge.wireless ? ` stroke-dasharray="${width * 3} ${width * 3}"` : ''}/>`,
    )
  }

  private static nodes(frame: TopologyFrame): string[] {
    const r = frame.radius
    return frame.nodes.map(
      (node) =>
        `<circle cx="${node.x}" cy="${node.y}" r="${r + 3}" fill="#0f172a"/><circle cx="${node.x}" cy="${node.y}" r="${r}" fill="${FILL[node.group]}" stroke="#0f172a" stroke-width="2"/>`,
    )
  }

  /** The lab title, one or two lines, top left. */
  private static title(lines: readonly string[]): string {
    return lines
      .map((line, index) => `<text x="${SIDE}" y="${TITLE_TOP + index * TITLE_LEADING}" font-size="${TITLE_SIZE}" font-weight="700" fill="#f8fafc">${OgTextLayout.escape(line)}</text>`)
      .join('')
  }

  /** The app icon (public/favicon.svg) and name at the bottom left; the author, or a legend, on the right. */
  private static brand(frame: TopologyFrame, author: string): string {
    const top = frame.height - BRAND_STRIP
    const middle = top + BRAND_STRIP / 2
    const iconSize = 64
    const scale = iconSize / 32
    return [
      `<rect y="${top}" width="${frame.width}" height="${BRAND_STRIP}" fill="#020617" fill-opacity="0.55"/>`,
      `<g transform="translate(${SIDE} ${middle - iconSize / 2}) scale(${scale})"><rect width="32" height="32" rx="7" fill="#0369a1"/><path d="M16 9v6M16 15l-7 7M16 15l7 7" stroke="#e0f2fe" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="8" r="3.2" fill="#fff"/><circle cx="9" cy="23" r="3.2" fill="#fff"/><circle cx="23" cy="23" r="3.2" fill="#fff"/></g>`,
      `<text x="${SIDE + iconSize + 22}" y="${middle + 11}" font-size="32" font-weight="700" fill="#f8fafc">Octetlab</text>`,
      author.trim() === '' ? OgImageSvg.legend(frame, middle) : OgImageSvg.author(frame, middle, author),
    ].join('')
  }

  private static author(frame: TopologyFrame, middle: number, author: string): string {
    const name = OgTextLayout.truncate(author, OgTextLayout.capacity(frame.width / 2 - SIDE, AUTHOR_SIZE))
    return `<text x="${frame.width - SIDE}" y="${middle + 9}" font-size="${AUTHOR_SIZE}" font-weight="500" fill="#cbd5e1" text-anchor="end">${OgTextLayout.escape(name)}</text>`
  }

  private static legend(frame: TopologyFrame, middle: number): string {
    return (Object.keys(FILL) as NodeGroup[])
      .map((group, index) => `<rect x="${frame.width - SIDE - (5 - index) * 44}" y="${middle - 6}" width="36" height="12" rx="6" fill="${FILL[group]}"/>`)
      .join('')
  }
}
