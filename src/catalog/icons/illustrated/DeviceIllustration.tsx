import type { DeviceIconId } from '../deviceIconTypes'
import { CLASSIC_ART } from './classic/classicArt'
import type { IllustratedIconStyle, IllustrationSet } from './illustratedTypes'
import { REALISTIC_ART } from './realistic/realisticArt'

/** Picture set of each illustrated style. */
export const ILLUSTRATION_SETS: Readonly<Record<IllustratedIconStyle, IllustrationSet>> = {
  classic: CLASSIC_ART,
  realistic: REALISTIC_ART,
}

interface DeviceIllustrationProps {
  icon: DeviceIconId
  style: IllustratedIconStyle
  className?: string
  /** Width and height; default 64 (the picture's own grid). */
  size?: number | string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}

/**
 * One frameless device picture of an illustrated style, drawn on a 64 × 64 grid. Its gradients come
 * from IllustratedIconDefs, mounted once per page.
 */
export function DeviceIllustration({ icon, style, className, size = 64, ...rest }: DeviceIllustrationProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      data-device-style={style}
      className={className}
      role={rest['aria-label'] === undefined ? undefined : 'img'}
      {...rest}
    >
      {ILLUSTRATION_SETS[style][icon]}
    </svg>
  )
}
