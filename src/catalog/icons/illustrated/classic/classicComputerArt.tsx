// Classic pictures of computers and servers (64×64). PC, laptop and tower server are the approved
// reference drawings; rack server, smartphone and tablet follow their colours.
import type { ReactNode } from 'react'

const BEIGE_OUTLINE = '#8a8371'
const GREY_OUTLINE = '#6b7280'

const pc: ReactNode = (
  <>
    <rect x="47" y="14" width="13" height="36" rx="1.5" fill="url(#octetClassicBeige)" stroke={BEIGE_OUTLINE} />
    <line x1="49.5" y1="20" x2="57.5" y2="20" stroke={BEIGE_OUTLINE} /><line x1="49.5" y1="24" x2="57.5" y2="24" stroke={BEIGE_OUTLINE} />
    <circle cx="53.5" cy="44" r="1.3" fill="#22c55e" />
    <rect x="6" y="8" width="38" height="29" rx="2" fill="url(#octetClassicBeige)" stroke={BEIGE_OUTLINE} />
    <rect x="9.5" y="11.5" width="31" height="21.5" fill="url(#octetClassicScreen)" />
    <polygon points="21,37 29,37 31,43 19,43" fill="#cfc8b6" stroke={BEIGE_OUTLINE} />
    <rect x="15" y="43" width="20" height="3" rx="1" fill="#cfc8b6" stroke={BEIGE_OUTLINE} />
    <polygon points="6,50 42,50 46,57 2,57" fill="#ddd7c8" stroke={BEIGE_OUTLINE} />
  </>
)

const laptop: ReactNode = (
  <>
    <rect x="13" y="10" width="38" height="27" rx="2" fill="#c9ced6" stroke={GREY_OUTLINE} />
    <rect x="16" y="13" width="32" height="21" fill="url(#octetClassicScreen)" />
    <polygon points="9,38 55,38 61,49 3,49" fill="#d6dae0" stroke={GREY_OUTLINE} />
    <polygon points="14,40 50,40 53,45 11,45" fill="#bcc2cb" />
    <rect x="26" y="46" width="12" height="2" rx="1" fill="#aab1bb" />
  </>
)

const towerServer: ReactNode = (
  <>
    <rect x="19" y="5" width="26" height="53" rx="2" fill="url(#octetClassicGrey)" stroke={GREY_OUTLINE} />
    <g fill="#9ca3af" stroke={GREY_OUTLINE} strokeWidth=".8">
      <rect x="23" y="10" width="18" height="5" rx="1" /><rect x="23" y="17" width="18" height="5" rx="1" /><rect x="23" y="24" width="18" height="5" rx="1" />
    </g>
    <g stroke="#9ca3af">
      <line x1="23" y1="36" x2="41" y2="36" /><line x1="23" y1="39" x2="41" y2="39" /><line x1="23" y1="42" x2="41" y2="42" />
    </g>
    <circle cx="26" cy="51" r="1.5" fill="#22c55e" /><circle cx="31" cy="51" r="1.5" fill="#f59e0b" />
  </>
)

/** One flat 1U unit of the rack server: front face at `y` (9 high), drive bays and two LEDs. */
function rackUnit(y: number) {
  return (
    <g key={y}>
      <rect x="6" y={y} width="44" height="9" fill="url(#octetClassicGrey)" stroke={GREY_OUTLINE} />
      <rect x="6" y={y} width="3" height="9" fill="#9ca3af" stroke={GREY_OUTLINE} strokeWidth=".6" />
      <rect x="47" y={y} width="3" height="9" fill="#9ca3af" stroke={GREY_OUTLINE} strokeWidth=".6" />
      <g fill="#8b929d" stroke={GREY_OUTLINE} strokeWidth=".5">
        <rect x="12" y={y + 2.5} width="7" height="4" rx=".6" /><rect x="20.5" y={y + 2.5} width="7" height="4" rx=".6" /><rect x="29" y={y + 2.5} width="7" height="4" rx=".6" />
      </g>
      <circle cx="40" cy={y + 4.5} r="1.2" fill="#22c55e" /><circle cx="43.5" cy={y + 4.5} r="1.2" fill="#38bdf8" />
    </g>
  )
}

/** Four rack units stacked in a box seen from the front-left. */
const rackServer: ReactNode = (
  <>
    <polygon points="14,12 58,12 50,20 6,20" fill="#d8dce2" stroke={GREY_OUTLINE} />
    <polygon points="50,20 58,12 58,48 50,56" fill="#9aa1ac" stroke={GREY_OUTLINE} />
    {[20, 29, 38, 47].map(rackUnit)}
  </>
)

const smartphone: ReactNode = (
  <>
    <rect x="21" y="5" width="22" height="52" rx="4" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <rect x="24" y="12" width="16" height="37" rx="1" fill="url(#octetClassicScreen)" />
    <rect x="28.5" y="8" width="7" height="1.6" rx=".8" fill="#6b7280" />
    <circle cx="32" cy="53" r="2" fill="#d1d5db" stroke="#6b7280" />
  </>
)

const tablet: ReactNode = (
  <>
    <rect x="11" y="5" width="42" height="53" rx="4" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <rect x="15" y="10" width="34" height="43" rx="1" fill="url(#octetClassicScreen)" />
    <circle cx="32" cy="7.5" r="1" fill="#6b7280" />
    <circle cx="32" cy="55.5" r="1.4" fill="#d1d5db" stroke="#6b7280" strokeWidth=".6" />
  </>
)

export const classicComputerArt = {
  pc,
  laptop,
  towerServer,
  rackServer,
  smartphone,
  tablet,
} as const satisfies Readonly<Record<string, ReactNode>>
