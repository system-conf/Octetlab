// Realistic pictures of servers, recorders, the internet and the ISP modems, plus the generic box.
import type { ReactNode } from 'react'
import type { DeviceIconId } from '../../deviceIconTypes'
import { ledRow } from './realisticParts'

const DARK_EDGE = '#64748b'

/** Internet: a globe (the approved reference drawing). */
const internetCloud = (
  <>
    <circle cx="32" cy="32" r="22" fill="url(#octetRealisticGlobe)" stroke="#075985" />
    <g fill="none" stroke="#e0f2fe" strokeOpacity=".75" strokeWidth={1.1}>
      <ellipse cx="32" cy="32" rx="9" ry="22" /><line x1="32" y1="10" x2="32" y2="54" />
      <path d="M12 24 H52 M10 32 H54 M12 40 H52" />
    </g>
    <ellipse cx="25" cy="21" rx="7" ry="4" fill="#fff" opacity=".25" />
  </>
)

/** Tall vertical tower server: drive bays on top, ventilation grille, power button. */
const towerServer = (
  <>
    <polygon points="17,10 39,10 47,3 25,3" fill="url(#octetRealisticDarkTop)" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="39,10 47,3 47,52 39,59" fill="#111318" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="17" y="10" width="22" height="49" rx="1.2" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <g fill="#3b4452" stroke="#5b6575" strokeWidth={0.5}>
      <rect x="20" y="13" width="16" height="4.2" rx=".6" /><rect x="20" y="18.6" width="16" height="4.2" rx=".6" /><rect x="20" y="24.2" width="16" height="4.2" rx=".6" />
    </g>
    <g fill="#4ade80"><circle cx="33.8" cy="15.1" r=".7" /><circle cx="33.8" cy="20.7" r=".7" /><circle cx="33.8" cy="26.3" r=".7" /></g>
    <g stroke="#3b4452" strokeWidth={1}>
      <line x1="20" y1="32" x2="36" y2="32" /><line x1="20" y1="34.6" x2="36" y2="34.6" /><line x1="20" y1="37.2" x2="36" y2="37.2" />
      <line x1="20" y1="39.8" x2="36" y2="39.8" /><line x1="20" y1="42.4" x2="36" y2="42.4" /><line x1="20" y1="45" x2="36" y2="45" />
    </g>
    <circle cx="28" cy="52.5" r="1.8" fill="none" stroke="#60a5fa" strokeWidth={1} />
    <circle cx="33" cy="52.5" r=".7" fill="#4ade80" />
  </>
)

/** 2U rack server: silver lid, dark front with six drive bays and rack ears (reference drawing). */
const rackServer = (
  <>
    <polygon points="6,26 52,26 58,20 12,20" fill="#d1d5db" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="6" y="26" width="46" height="19" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <polygon points="52,26 58,20 58,39 52,45" fill="#0f1217" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <g fill="#3b4452" stroke="#5b6575" strokeWidth={0.5}>
      <rect x="10" y="29" width="4.6" height="12" /><rect x="16" y="29" width="4.6" height="12" /><rect x="22" y="29" width="4.6" height="12" />
      <rect x="28" y="29" width="4.6" height="12" /><rect x="34" y="29" width="4.6" height="12" /><rect x="40" y="29" width="4.6" height="12" />
    </g>
    <g fill="#4ade80"><circle cx="12.3" cy="31" r=".7" /><circle cx="18.3" cy="31" r=".7" /><circle cx="24.3" cy="31" r=".7" /><circle cx="30.3" cy="31" r=".7" /></g>
    <circle cx="48" cy="31" r="1.2" fill="#60a5fa" />
    <g fill="#a3aab5" stroke="#6b7280" strokeWidth={0.5}>
      <rect x="3" y="26" width="3" height="19" rx=".6" /><rect x="52" y="26" width="3" height="19" rx=".6" />
    </g>
    <g fill="#4b5563"><circle cx="4.5" cy="29" r=".6" /><circle cx="4.5" cy="42" r=".6" /><circle cx="53.5" cy="29" r=".6" /><circle cx="53.5" cy="42" r=".6" /></g>
  </>
)

/** Network video recorder: wide flat black box, plain front with status LEDs, USB and power. */
const nvr = (
  <>
    <polygon points="4,34 52,34 59,26 11,26" fill="url(#octetRealisticDarkTop)" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="52,34 59,26 59,35 52,43" fill="#111318" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="4" y="34" width="48" height="9" rx="1" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <ellipse cx="33" cy="30" rx="5" ry="2.2" fill="#1f2937" stroke="#94a3b8" strokeWidth={0.7} />
    <ellipse cx="33" cy="30" rx="1.8" ry=".8" fill="#38bdf8" />
    {ledRow(8.5, 38.5, 3, 0.8, ['#4ade80', '#4ade80', '#38bdf8', '#ef4444'])}
    <rect x="20" y="36.2" width="19" height="4.6" rx="1" fill="#0b0f16" stroke="#374151" strokeWidth={0.5} />
    <rect x="21.5" y="37.8" width="16" height="1.5" rx=".75" fill="#38bdf8" opacity=".9" />
    <rect x="41.5" y="37.5" width="3.6" height="2" fill="#9ca3af" />
    <circle cx="48.5" cy="38.5" r="1.5" fill="none" stroke="#60a5fa" strokeWidth={0.9} />
  </>
)

/** DSL modem: flat white box with a front LED row, phone cord running to a wall phone socket. */
const dslModem = (
  <>
    <rect x="6" y="7" width="12" height="13" rx="1.5" fill="url(#octetRealisticWhite)" stroke="#9ca3af" strokeWidth={0.7} />
    <rect x="9.5" y="11.5" width="5" height="4" rx=".4" fill="#374151" />
    <path d="M12 20 C 12 23, 14 23, 14 25 S 16 27, 16 29 S 18 31, 19 32" fill="none" stroke="#6b7280" strokeWidth={1.4} strokeLinecap="round" />
    <polygon points="10,38 48,38 55,31 17,31" fill="#f8fafc" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="48,38 55,31 55,42 48,49" fill="#cbd2db" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="10" y="38" width="38" height="11" rx="2" fill="url(#octetRealisticWhite)" stroke="#9ca3af" strokeWidth={0.6} />
    {ledRow(14.5, 43.5, 4, 0.9, ['#4ade80', '#4ade80', '#4ade80', '#38bdf8', '#fbbf24'])}
    <rect x="38" y="41.5" width="6" height="4" rx=".4" fill="#475569" />
  </>
)

/** Cable modem: upright white box with a column of LEDs and a gold coax screw connector + cable. */
const cableModem = (
  <>
    <polygon points="22,13 38,13 45,7 29,7" fill="#f8fafc" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="38,13 45,7 45,51 38,57" fill="#cbd2db" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="22" y="13" width="16" height="44" rx="2.5" fill="url(#octetRealisticWhite)" stroke="#9ca3af" strokeWidth={0.7} />
    <g fill="#4ade80"><circle cx="30" cy="18" r=".9" /><circle cx="30" cy="22" r=".9" /><circle cx="30" cy="26" r=".9" /></g>
    <circle cx="30" cy="30" r=".9" fill="#38bdf8" />
    <path d="M27.4 46 C 20 47, 14 50, 9 57" fill="none" stroke="#6b7280" strokeWidth={3.4} strokeLinecap="round" />
    <path d="M27.4 46 C 20 47, 14 50, 9 57" fill="none" stroke="#1f2937" strokeWidth={2.2} strokeLinecap="round" />
    <polygon points="30,41.6 33.8,43.8 33.8,48.2 30,50.4 26.2,48.2 26.2,43.8" fill="#eab308" stroke="#a16207" strokeWidth={0.7} />
    <circle cx="30" cy="46" r="1.8" fill="#fde68a" stroke="#a16207" strokeWidth={0.5} />
    <circle cx="30" cy="46" r=".5" fill="#78350f" />
  </>
)

/** Unknown device: neutral grey box with a single Ethernet port. */
const genericDevice = (
  <>
    <polygon points="14,30 44,30 52,22 22,22" fill="#d1d5db" stroke="#6b7280" strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="44,30 52,22 52,42 44,50" fill="#7c838e" stroke="#6b7280" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="14" y="30" width="30" height="20" rx="1.5" fill="url(#octetRealisticGreyFront)" stroke="#6b7280" strokeWidth={0.6} />
    <path d="M23.5 37 H34.5 V43.5 H32.5 V45.5 H25.5 V43.5 H23.5 Z" fill="#1b1f26" stroke="#4b5563" strokeWidth={0.5} />
    <circle cx="24.8" cy="35" r=".7" fill="#4ade80" /><circle cx="33.2" cy="35" r=".7" fill="#fbbf24" />
    <circle cx="39.5" cy="34" r="1" fill="#22c55e" />
  </>
)

export const REALISTIC_INFRA_ART = {
  internetCloud,
  towerServer,
  rackServer,
  nvr,
  dslModem,
  cableModem,
  genericDevice,
} satisfies Partial<Record<DeviceIconId, ReactNode>>
