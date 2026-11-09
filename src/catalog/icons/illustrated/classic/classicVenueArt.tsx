// Classic pictures of shop and venue devices (64×64): NVR recorder, POS terminal, kitchen display,
// smart TV and the neutral fallback box. Dark bodies get a lighter rim so they still read on the
// dark canvas.
import type { ReactNode } from 'react'

const DARK_RIM = '#1f2937'

/** Flat charcoal recorder with a hard-disk mark, a red record LED and vent slots. */
const nvr: ReactNode = (
  <>
    <polygon points="14,20 58,20 50,28 6,28" fill="#8a929e" stroke={DARK_RIM} />
    <rect x="6" y="28" width="44" height="16" rx="1" fill="url(#octetClassicCharcoal)" stroke={DARK_RIM} />
    <polygon points="50,28 58,20 58,36 50,44" fill="#2d333d" stroke={DARK_RIM} />
    <rect x="9.5" y="30.5" width="15" height="11" rx="1.5" fill="#d1d5db" stroke="#9ca3af" strokeWidth=".6" />
    <circle cx="17" cy="36" r="4" fill="#9ca3af" stroke="#4b5563" strokeWidth=".8" />
    <circle cx="17" cy="36" r="1" fill="#4b5563" />
    <path d="M22.5 32.5 L18.2 36.4" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="30" cy="36" r="1.7" fill="#ef4444" stroke="#7f1d1d" strokeWidth=".5" />
    <circle cx="35" cy="36" r="1.2" fill="#22c55e" />
    <g stroke="#7b8494" strokeWidth="1"><path d="M39 32 V40 M42 32 V40 M45 32 V40" /></g>
    <path d="M9 44 V47 M47 44 V47" stroke={DARK_RIM} strokeWidth="2" />
  </>
)

/** POS terminal: angled touch screen on a neck, receipt printer with paper, cash drawer below. */
const pos: ReactNode = (
  <>
    <polygon points="10,40 54,40 58,45 6,45" fill="#9aa1ac" stroke={DARK_RIM} />
    <rect x="6" y="45" width="52" height="11" rx="1" fill="url(#octetClassicCharcoal)" stroke={DARK_RIM} />
    <rect x="24" y="49" width="16" height="2.4" rx="1.2" fill="#c3c8cf" />
    <rect x="21" y="30" width="6" height="11" fill="#6b7280" stroke={DARK_RIM} strokeWidth=".8" />
    <rect x="7" y="8" width="32" height="24" rx="2" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <rect x="10" y="11" width="26" height="18" fill="url(#octetClassicScreen)" />
    <g fill="#dbeafe" opacity=".85">
      <rect x="12" y="13" width="7" height="4" rx=".6" /><rect x="20.5" y="13" width="7" height="4" rx=".6" />
      <rect x="12" y="19" width="7" height="4" rx=".6" /><rect x="20.5" y="19" width="7" height="4" rx=".6" />
      <rect x="29" y="13" width="5" height="14" rx=".6" fill="#86efac" />
    </g>
    <path d="M45 26 V12 L46.5 13.5 L48 12 L49.5 13.5 L51 12 L52.5 13.5 L54 12 V26 Z" fill="#fff" stroke="#9ca3af" strokeWidth=".8" />
    <path d="M47 16.5 H52 M47 19 H52 M47 21.5 H50.5" stroke="#9ca3af" strokeWidth=".8" />
    <rect x="42" y="26" width="15" height="14" rx="1.5" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <rect x="44" y="26" width="11" height="2" fill="#4b5563" />
    <circle cx="54" cy="36" r="1.1" fill="#22c55e" />
  </>
)

/** One order ticket on the kitchen screen: coloured header bar and item lines. */
function orderTicket(x: number, height: number, header: string) {
  return (
    <g key={x}>
      <rect x={x} y="13" width="13" height={height} rx="1" fill="#f8fafc" />
      <rect x={x} y="13" width="13" height="4" rx="1" fill={header} />
      <path d={`M${x + 2} 20.5 H${x + 11} M${x + 2} 23.5 H${x + 9} M${x + 2} 26.5 H${x + 10}`} stroke="#64748b" strokeWidth="1" />
    </g>
  )
}

/** Wall-mounted kitchen screen with three order tickets (green, amber, red headers). */
const kitchenDisplay: ReactNode = (
  <>
    <rect x="26" y="4" width="12" height="7" rx="1" fill="#6b7280" stroke={DARK_RIM} />
    <rect x="5" y="9" width="54" height="36" rx="2" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <rect x="8" y="11.5" width="48" height="31" fill="#1e293b" />
    {orderTicket(10, 27, '#22c55e')}
    {orderTicket(25.5, 21, '#f59e0b')}
    {orderTicket(41, 24, '#ef4444')}
  </>
)

/** Wide thin-bezel TV with a picture and play mark, on a centre stand. */
const smartTv: ReactNode = (
  <>
    <rect x="29" y="44" width="6" height="7" fill="#4b5563" stroke={DARK_RIM} strokeWidth=".8" />
    <path d="M16 55 Q16 50 22 50 H42 Q48 50 48 55 Z" fill="#6b7280" stroke={DARK_RIM} />
    <rect x="3" y="11" width="58" height="35" rx="2" fill="#374151" stroke={DARK_RIM} />
    <rect x="5.5" y="13.5" width="53" height="30" fill="url(#octetClassicScreen)" />
    <path d="M5.5 37 L20 27 L30 34 L42 24 L58.5 36 V43.5 H5.5 Z" fill="#1e3a6e" opacity=".55" />
    <circle cx="32" cy="27" r="7" fill="#fff" opacity=".9" />
    <path d="M29.5 23.5 V30.5 L36 27 Z" fill="#1e4f91" />
    <circle cx="57" cy="45" r=".8" fill="#ef4444" />
  </>
)

/** Neutral grey box with a question mark and one port on its side. */
const genericDevice: ReactNode = (
  <>
    <polygon points="12,22 44,22 54,12 22,12" fill="#e5e7eb" stroke="#4b5563" />
    <rect x="12" y="22" width="32" height="32" rx="1.5" fill="url(#octetClassicGrey)" stroke="#4b5563" />
    <polygon points="44,22 54,12 54,44 44,54" fill="#9aa1ac" stroke="#4b5563" />
    <path d="M22.5 32 Q22.5 26.5 28 26.5 Q33.5 26.5 33.5 31.5 Q33.5 34.5 28 37 V41" fill="none" stroke="#475569" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="28" cy="47" r="2.2" fill="#475569" />
    <polygon points="46.5,33 51.5,28 51.5,34 46.5,39" fill="#1f2937" />
  </>
)

export const classicVenueArt = {
  nvr,
  pos,
  kitchenDisplay,
  smartTv,
  genericDevice,
} as const satisfies Readonly<Record<string, ReactNode>>
