// Classic pictures of printers, phones and cameras (64×64). The printer is the approved reference
// drawing; the multifunction printer adds a scanner lid, the IP phone is a desk phone with handset
// and small screen, the IP camera is a bullet camera on a wall mount.
import type { ReactNode } from 'react'

const GREY_OUTLINE = '#6b7280'

const printer: ReactNode = (
  <>
    <rect x="20" y="6" width="24" height="14" fill="#fff" stroke="#9ca3af" />
    <line x1="24" y1="10" x2="40" y2="10" stroke="#cbd5e1" /><line x1="24" y1="13" x2="36" y2="13" stroke="#cbd5e1" />
    <polygon points="16,16 48,16 54,24 10,24" fill="#d8dce2" stroke={GREY_OUTLINE} />
    <rect x="10" y="24" width="44" height="20" rx="2" fill="url(#octetClassicGrey)" stroke={GREY_OUTLINE} />
    <rect x="40" y="28" width="9" height="4" rx="1" fill="#22c55e" stroke="#15803d" strokeWidth=".6" />
    <rect x="16" y="38" width="32" height="2" fill={GREY_OUTLINE} />
    <rect x="18" y="44" width="28" height="8" fill="#fff" stroke="#9ca3af" />
  </>
)

/** Taller printer body under a flat scanner lid, with a blue control screen and a paper drawer. */
const multifunctionPrinter: ReactNode = (
  <>
    <polygon points="14,8 50,8 56,16 8,16" fill="#eef0f3" stroke={GREY_OUTLINE} />
    <rect x="8" y="16" width="48" height="4" fill="#c3c8cf" stroke={GREY_OUTLINE} />
    <rect x="8" y="20" width="48" height="34" rx="2" fill="url(#octetClassicGrey)" stroke={GREY_OUTLINE} />
    <rect x="38" y="23" width="14" height="7" rx="1" fill="url(#octetClassicScreen)" stroke="#1e4f91" strokeWidth=".6" />
    <circle cx="13" cy="26.5" r="1.4" fill="#22c55e" />
    <rect x="14" y="34" width="36" height="2" fill={GREY_OUTLINE} />
    <rect x="17" y="36" width="30" height="5" fill="#fff" stroke="#9ca3af" />
    <rect x="12" y="44" width="40" height="7" rx="1" fill="#cfd4db" stroke={GREY_OUTLINE} />
    <rect x="27" y="46.5" width="10" height="2" rx="1" fill={GREY_OUTLINE} />
  </>
)

/** Desk phone: dark handset lying across the top, grey base with a small screen and keypad. */
const ipPhone: ReactNode = (
  <>
    <polygon points="12,28 52,28 58,54 6,54" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <rect x="13" y="34" width="18" height="10" rx="1" fill="url(#octetClassicScreen)" stroke="#1e4f91" strokeWidth=".6" />
    <g fill="#4b5563">
      <rect x="36" y="34" width="4" height="3" rx=".6" /><rect x="42" y="34" width="4" height="3" rx=".6" /><rect x="48" y="34" width="4" height="3" rx=".6" />
      <rect x="36.5" y="39" width="4" height="3" rx=".6" /><rect x="42.5" y="39" width="4" height="3" rx=".6" /><rect x="48.5" y="39" width="4" height="3" rx=".6" />
      <rect x="37" y="44" width="4" height="3" rx=".6" /><rect x="43" y="44" width="4" height="3" rx=".6" /><rect x="49" y="44" width="4" height="3" rx=".6" />
    </g>
    <rect x="12" y="48" width="20" height="2.4" rx="1" fill="#9ca3af" />
    <path
      d="M6 26 Q6 13 18 13 H46 Q58 13 58 26 L50 28.5 Q49 20 44 20 H20 Q15 20 14 28.5 Z"
      fill="#4b5563"
      stroke="#1f2937"
    />
  </>
)

/** Bullet camera with a sun hood, tilted down, on an arm from a wall plate on the right. */
const ipCamera: ReactNode = (
  <>
    <rect x="52" y="30" width="7" height="22" rx="1.5" fill="#d1d5db" stroke={GREY_OUTLINE} />
    <path d="M54 41 L42 41 L38 32" fill="none" stroke="#4b5563" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
    <g transform="rotate(14 30 24)">
      <rect x="10" y="17" width="38" height="15" rx="3" fill="url(#octetClassicWhite)" stroke={GREY_OUTLINE} />
      <rect x="7" y="13" width="42" height="5" rx="2" fill="#e5e7eb" stroke={GREY_OUTLINE} />
      <ellipse cx="11" cy="24.5" rx="3.5" ry="7" fill="#1f2937" stroke="#111827" />
      <ellipse cx="10.4" cy="24.5" rx="2" ry="4.2" fill="url(#octetClassicScreen)" />
      <circle cx="42" cy="27" r="1.2" fill="#ef4444" />
    </g>
  </>
)

export const classicPeripheralArt = {
  printer,
  multifunctionPrinter,
  ipPhone,
  ipCamera,
} as const satisfies Readonly<Record<string, ReactNode>>
