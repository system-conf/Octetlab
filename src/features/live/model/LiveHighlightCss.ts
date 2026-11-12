// Live labs: the glow on the devices and cables the assistant just changed. React Flow marks every
// node and edge with `data-id`, so the glow is a scoped style sheet for those ids (the canvas code
// stays unchanged). Ids come from the server: they are escaped for a quoted CSS attribute value.

/** Container attribute that scopes the rules to the live screen. */
export const LIVE_SCOPE_ATTRIBUTE = 'data-live-lab'

const GLOW = 'var(--color-packet-highlight)'

/**
 * `value` safe inside a double-quoted CSS string in a `<style>` element: backslash and quote escaped,
 * line breaks and angle brackets as hex escapes (no `</style>` can close the element).
 */
export function cssString(value: string): string {
  return value
    .replace(/[\\"]/g, (character) => `\\${character}`)
    .replace(/[\n\r\f<>]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `)
}

export class LiveHighlightCss {
  /**
   * Style rules for the highlighted ids; '' when nothing is highlighted. `animated`: a short pulse
   * (off when the viewer asked for reduced motion: then the glow is steady).
   */
  static build(deviceIds: readonly string[], linkIds: readonly string[], animated: boolean): string {
    if (deviceIds.length === 0 && linkIds.length === 0) return ''
    const scope = `[${LIVE_SCOPE_ATTRIBUTE}]`
    const nodes = deviceIds.map((id) => `${scope} .react-flow__node[data-id="${cssString(id)}"]`)
    const edges = linkIds.map((id) => `${scope} .react-flow__edge[data-id="${cssString(id)}"] .react-flow__edge-path`)
    const animation = animated ? ' animation: liveLabPulse 0.8s ease-in-out 3;' : ''
    const rules: string[] = []
    if (nodes.length > 0) {
      rules.push(`${nodes.join(',\n')} { outline: 3px solid ${GLOW}; outline-offset: 4px; border-radius: 12px; box-shadow: 0 0 18px 4px ${GLOW};${animation} }`)
    }
    if (edges.length > 0) {
      rules.push(`${edges.join(',\n')} { stroke: ${GLOW} !important; stroke-width: 5px !important; filter: drop-shadow(0 0 4px ${GLOW}); }`)
    }
    if (animated && nodes.length > 0) {
      rules.push(`@keyframes liveLabPulse { 50% { outline-offset: 8px; box-shadow: 0 0 28px 8px ${GLOW}; } }`)
    }
    return rules.join('\n')
  }
}
