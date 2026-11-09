// Contract of the illustrated device pictures (Preferences → Map → device style).
// 'simple' (the default) keeps today's framed line icons (DeviceKindIcon); the two illustrated
// styles draw frameless, coloured pictures instead.
import type { ReactNode } from 'react'
import type { DeviceIconId } from '../deviceIconTypes'

export type IllustratedIconStyle = 'classic' | 'realistic'

/**
 * One full set of pictures: SVG content for a 64×64 viewBox, one per DeviceIconId.
 * Gradients are referenced by id from the style's defs component (ClassicIconDefs /
 * RealisticIconDefs), which is mounted once per page by IllustratedIconDefs.
 * Gradient ids are prefixed per style: `octetClassic…` / `octetRealistic…`.
 */
export type IllustrationSet = Readonly<Record<DeviceIconId, ReactNode>>
