import type { CSSProperties } from 'react'
import { ClassicIconDefs } from './classic/ClassicIconDefs'
import { RealisticIconDefs } from './realistic/RealisticIconDefs'

/**
 * Zero-size, out-of-flow holder. Not `display: none`: gradients inside a hidden SVG do not resolve
 * in every browser, so the pictures would lose their fills.
 */
const hidden: CSSProperties = { position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }

/**
 * Gradients of both illustrated styles (ids `octetClassic…`, `octetRealistic…`), referenced by every
 * DeviceIllustration on the page. Mount once, near the app root.
 */
export function IllustratedIconDefs() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style={hidden} aria-hidden="true" focusable="false">
      <ClassicIconDefs />
      <RealisticIconDefs />
    </svg>
  )
}
