// Classic network-diagram pictures of the network gear (64×64): blue router cylinder, blue switch
// boxes, brick firewall, access point and wireless router. Router, switch and access point are the
// approved reference drawings; the others follow their shapes and colours.
import type { ReactNode } from 'react'
import { CLASSIC_BLUE_OUTLINE, CLASSIC_TOP_SHEAR, classicBlueBox, classicRouterArrows } from './classicShapes'

const router: ReactNode = (
  <>
    <path d="M6 26 V40 A26 9 0 0 0 58 40 V26 Z" fill="url(#octetClassicBlueSide)" stroke={CLASSIC_BLUE_OUTLINE} strokeWidth="1" />
    <ellipse cx="32" cy="26" rx="26" ry="9" fill="url(#octetClassicBlueTop)" stroke={CLASSIC_BLUE_OUTLINE} strokeWidth="1" />
    <g transform="translate(32 26) scale(1 .36)">{classicRouterArrows('#fff')}</g>
  </>
)

/** The four two-way arrows on the switch top (two right, two left), in sheared top coordinates. */
const switchArrows = (
  <g transform={CLASSIC_TOP_SHEAR} fill="#fff">
    <path d="M30 20 H40 V18.4 L44 21 L40 23.6 V22 H30 Z" />
    <path d="M48 20 H58 V18.4 L62 21 L58 23.6 V22 H48 Z" />
    <path d="M46 26 H36 V24.4 L32 27 L36 29.6 V28 H46 Z" />
    <path d="M64 26 H54 V24.4 L50 27 L54 29.6 V28 H64 Z" />
  </g>
)

const switchArt: ReactNode = (
  <>
    {classicBlueBox(30, 42)}
    {switchArrows}
  </>
)

/** Taller switch box with the switch arrows on top and the router mark on the front. */
const l3Switch: ReactNode = (
  <>
    {classicBlueBox(24, 48)}
    <g transform="translate(0 -6)">{switchArrows}</g>
    <circle cx="28" cy="36" r="9.5" fill="#1a5f9e" stroke="#9fd0f7" strokeWidth="1" />
    <g transform="translate(28 36) scale(.4)">{classicRouterArrows('#fff')}</g>
  </>
)

/** Hub: the same box, but one long shared two-way arrow on top and a row of port dots in front. */
const hub: ReactNode = (
  <>
    {classicBlueBox(30, 42)}
    <g transform={CLASSIC_TOP_SHEAR} fill="#fff">
      <path d="M31 24 L37 19.6 V22.4 H59 V19.6 L65 24 L59 28.4 V25.6 H37 V28.4 Z" />
    </g>
    <g fill="#bfe0fb">
      <circle cx="12" cy="36" r="1.6" /><circle cx="18" cy="36" r="1.6" /><circle cx="24" cy="36" r="1.6" />
      <circle cx="30" cy="36" r="1.6" /><circle cx="36" cy="36" r="1.6" /><circle cx="42" cy="36" r="1.6" />
    </g>
  </>
)

/** Brick wall block: orange top, red brick front with light mortar, dark red side. */
const firewall: ReactNode = (
  <>
    <polygon points="14,12 58,12 50,22 6,22" fill="#f29a6b" stroke="#5c1a0b" />
    <rect x="6" y="22" width="44" height="30" fill="url(#octetClassicBrick)" stroke="#5c1a0b" />
    <polygon points="50,22 58,12 58,42 50,52" fill="#8f2c16" stroke="#5c1a0b" />
    <g stroke="#f8d9c4" strokeWidth="1.4">
      <path d="M6 29.5 H50 M6 37 H50 M6 44.5 H50" />
      <path d="M17 22 V29.5 M28 22 V29.5 M39 22 V29.5" />
      <path d="M11.5 29.5 V37 M22.5 29.5 V37 M33.5 29.5 V37 M44.5 29.5 V37" />
      <path d="M17 37 V44.5 M28 37 V44.5 M39 37 V44.5" />
      <path d="M11.5 44.5 V52 M22.5 44.5 V52 M33.5 44.5 V52 M44.5 44.5 V52" />
    </g>
    <g stroke="#f8d9c4" strokeWidth="1" opacity=".7">
      <path d="M50 29.5 L58 19.5 M50 37 L58 27 M50 44.5 L58 34.5" />
      <path d="M17 22 L25 12 M39 22 L47 12 M28 22 L36 12" />
    </g>
  </>
)

const accessPoint: ReactNode = (
  <>
    <g fill="none" stroke="#2b7cc4" strokeWidth="2.4" strokeLinecap="round">
      <path d="M25 27 A10 10 0 0 1 41 27" /><path d="M20 22 A17 17 0 0 1 46 22" /><path d="M15 17 A24 24 0 0 1 51 17" />
    </g>
    <polygon points="20,36 52,36 46,44 14,44" fill="url(#octetClassicBlueTop)" stroke={CLASSIC_BLUE_OUTLINE} />
    <rect x="14" y="44" width="32" height="7" fill="#2272b8" stroke={CLASSIC_BLUE_OUTLINE} />
    <polygon points="46,44 52,36 52,43 46,51" fill="#155a94" stroke={CLASSIC_BLUE_OUTLINE} />
  </>
)

/** Router cylinder (a little lower) with two antennas and radio waves between them. */
const wirelessRouter: ReactNode = (
  <>
    <g stroke={CLASSIC_BLUE_OUTLINE} strokeLinecap="round">
      <line x1="15" y1="34" x2="11" y2="10" strokeWidth="4" />
      <line x1="49" y1="34" x2="53" y2="10" strokeWidth="4" />
    </g>
    <g stroke="#3b82c4" strokeLinecap="round" strokeWidth="1.6">
      <line x1="15" y1="34" x2="11" y2="10" /><line x1="49" y1="34" x2="53" y2="10" />
    </g>
    <g fill="#2b7cc4" stroke={CLASSIC_BLUE_OUTLINE} strokeWidth=".8">
      <circle cx="11" cy="10" r="2.4" /><circle cx="53" cy="10" r="2.4" />
    </g>
    <g fill="none" stroke="#2b7cc4" strokeWidth="2.4" strokeLinecap="round">
      <path d="M26 24 A8 8 0 0 1 38 24" /><path d="M21 19 A15 15 0 0 1 43 19" />
    </g>
    <path d="M8 36 V48 A24 8 0 0 0 56 48 V36 Z" fill="url(#octetClassicBlueSide)" stroke={CLASSIC_BLUE_OUTLINE} strokeWidth="1" />
    <ellipse cx="32" cy="36" rx="24" ry="8" fill="url(#octetClassicBlueTop)" stroke={CLASSIC_BLUE_OUTLINE} strokeWidth="1" />
    <g transform="translate(32 36) scale(.9 .32)">{classicRouterArrows('#fff')}</g>
  </>
)

export const classicNetworkArt = {
  router,
  switch: switchArt,
  l3Switch,
  hub,
  firewall,
  accessPoint,
  wirelessRouter,
} as const satisfies Readonly<Record<string, ReactNode>>
