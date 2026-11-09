// Shapes shared by several classic pictures: the router's four-arrow mark and the oblique blue box
// of the switch family.

/** One fat arrow pointing right along +x, tail at the origin (16 long). */
export const CLASSIC_ARROW_PATH = 'M0 -2.4 H9 V-6 L16 0 L9 6 V2.4 H0 Z'

/** Dark outline of every blue network shape. */
export const CLASSIC_BLUE_OUTLINE = '#0d3d66'

/**
 * The router mark: two arrows pointing in and two pointing out on the diagonals, centred on the
 * origin (the caller translates and squashes it onto a cylinder top or a box face).
 */
export function classicRouterArrows(fill: string) {
  return (
    <g fill={fill}>
      <g transform="rotate(-45) translate(6 0)"><path d={CLASSIC_ARROW_PATH} /></g>
      <g transform="rotate(135) translate(6 0)"><path d={CLASSIC_ARROW_PATH} /></g>
      <g transform="rotate(45) translate(22 0) rotate(180)"><path d={CLASSIC_ARROW_PATH} /></g>
      <g transform="rotate(-135) translate(22 0) rotate(180)"><path d={CLASSIC_ARROW_PATH} /></g>
    </g>
  )
}

/**
 * Blue box seen from the front-left: front face x 6…50 between `top` and `bottom`, top face and
 * right side going 8 right and 12 up (the switch drawing of the approved reference).
 */
export function classicBlueBox(top: number, bottom: number) {
  return (
    <>
      <polygon points={`14,${top - 12} 58,${top - 12} 50,${top} 6,${top}`} fill="url(#octetClassicBlueTop)" stroke={CLASSIC_BLUE_OUTLINE} />
      <rect x="6" y={top} width="44" height={bottom - top} fill="#2272b8" stroke={CLASSIC_BLUE_OUTLINE} />
      <polygon points={`50,${top} 58,${top - 12} 58,${bottom - 12} 50,${bottom}`} fill="#155a94" stroke={CLASSIC_BLUE_OUTLINE} />
    </>
  )
}

/** The oblique top face shear: x' = x − 0.667·y (top face of {@link classicBlueBox}). */
export const CLASSIC_TOP_SHEAR = 'matrix(1 0 -0.667 1 0 0)'
