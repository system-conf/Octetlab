// The Open Graph picture of a share page (docs/SHARE_PAGES.md §7) as SVG, rasterised to PNG by the
// share store. Text-free on purpose: the Worker has no fonts, and link previews already show the
// page title next to the image. Only numbers from the layout go into the markup (no user text).
import type { LabDocument } from '../../../src/domain'
import { ShareTopology, type NodeGroup, type TopologyFrame } from '../../../src/features/share/model/ShareTopology'

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

const FILL: Readonly<Record<NodeGroup, string>> = {
  internet: '#f59e0b',
  router: '#38bdf8',
  switch: '#34d399',
  wireless: '#a78bfa',
  endpoint: '#e2e8f0',
}

const BRAND_STRIP = 110

export class OgImageSvg {
  static build(doc: LabDocument): string {
    const frame = ShareTopology.fit(doc, {
      ...OG_IMAGE_SIZE,
      padding: { top: 70, right: 90, bottom: BRAND_STRIP + 40, left: 90 },
    })
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`,
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#0c4a6e"/></linearGradient></defs>',
      `<rect width="${frame.width}" height="${frame.height}" fill="url(#bg)"/>`,
      OgImageSvg.grid(frame),
      ...OgImageSvg.edges(frame),
      ...OgImageSvg.nodes(frame),
      OgImageSvg.brand(frame),
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

  /** The app icon (public/favicon.svg) at the bottom left and a coloured legend bar. */
  private static brand(frame: TopologyFrame): string {
    const top = frame.height - BRAND_STRIP
    const iconSize = 64
    const iconY = top + (BRAND_STRIP - iconSize) / 2
    const scale = iconSize / 32
    const legend = (Object.keys(FILL) as NodeGroup[])
      .map((group, index) => `<rect x="${frame.width - 90 - (5 - index) * 44}" y="${top + BRAND_STRIP / 2 - 6}" width="36" height="12" rx="6" fill="${FILL[group]}"/>`)
      .join('')
    return [
      `<rect y="${top}" width="${frame.width}" height="${BRAND_STRIP}" fill="#020617" fill-opacity="0.55"/>`,
      `<g transform="translate(90 ${iconY}) scale(${scale})"><rect width="32" height="32" rx="7" fill="#0369a1"/><path d="M16 9v6M16 15l-7 7M16 15l7 7" stroke="#e0f2fe" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="8" r="3.2" fill="#fff"/><circle cx="9" cy="23" r="3.2" fill="#fff"/><circle cx="23" cy="23" r="3.2" fill="#fff"/></g>`,
      legend,
    ].join('')
  }
}
