// Realistic pictures of the user devices: computers, phones, tablets and printers.
import type { ReactNode } from 'react'
import type { DeviceIconId } from '../../deviceIconTypes'
import { portGrid } from './realisticParts'

const DARK_EDGE = '#64748b'

/** Desktop PC: monitor with wallpaper, small tower, keyboard (the approved reference drawing). */
const pc = (
  <>
    <rect x="49" y="18" width="11" height="32" rx="1.5" fill="#1f2937" stroke={DARK_EDGE} />
    <circle cx="54.5" cy="22" r="1.2" fill="#60a5fa" /><line x1="51" y1="45" x2="58" y2="45" stroke="#4b5563" />
    <rect x="5" y="8" width="42" height="29" rx="2" fill="#0b0f16" stroke={DARK_EDGE} strokeWidth={0.7} />
    <rect x="7" y="10" width="38" height="24" fill="url(#octetRealisticWall)" />
    <rect x="24" y="37" width="4" height="7" fill="#6b7280" />
    <ellipse cx="26" cy="45" rx="10" ry="2.2" fill="#9ca3af" stroke="#6b7280" strokeWidth={0.5} />
    <polygon points="8,51 42,51 46,57 4,57" fill="#e5e7eb" stroke="#9ca3af" />
  </>
)

/** Open laptop (the approved reference drawing). */
const laptop = (
  <>
    <rect x="12" y="9" width="40" height="28" rx="2" fill="#111827" stroke="#9ca3af" strokeWidth={0.8} />
    <rect x="14.5" y="11.5" width="35" height="23" fill="url(#octetRealisticWall)" />
    <polygon points="8,38 56,38 62,47 2,47" fill="url(#octetRealisticWhite)" stroke="#9ca3af" />
    <rect x="27" y="42" width="10" height="3" rx="1" fill="#cbd2db" />
    <rect x="2" y="47" width="60" height="2" rx="1" fill="#a3aab5" />
  </>
)

/** Portrait smartphone with a grid of app icons. */
const smartphone = (
  <>
    <rect x="21" y="5" width="22" height="53" rx="5" fill="#111827" stroke="#9ca3af" strokeWidth={0.8} />
    <rect x="23" y="8" width="18" height="47" rx="3" fill="url(#octetRealisticWall)" />
    <rect x="29" y="9.4" width="6" height="1.8" rx=".9" fill="#0b0f16" />
    {portGrid({ x: 25, y: 15, columns: 3, rows: 4, stepX: 5, stepY: 6, width: 3.6, height: 3.6, rx: 0.9, fill: '#ffffff' })}
    <rect x="27" y="51.5" width="10" height="1.2" rx=".6" fill="#ffffff" opacity=".8" />
  </>
)

/** Landscape tablet with a row of app icons. */
const tablet = (
  <>
    <rect x="4" y="13" width="56" height="38" rx="4.5" fill="#111827" stroke="#9ca3af" strokeWidth={0.8} />
    <rect x="9" y="16" width="47" height="32" rx="1.5" fill="url(#octetRealisticWall)" />
    <circle cx="6.6" cy="32" r=".8" fill="#374151" />
    {portGrid({ x: 13, y: 21, columns: 6, rows: 2, stepX: 7, stepY: 8, width: 4.6, height: 4.6, rx: 1.1, fill: '#ffffff' })}
  </>
)

/** Desk IP phone: handset on the left, LCD and keypad on a sloped dark body. */
const ipPhone = (
  <>
    <polygon points="12,14 58,14 58,46 6,46" fill="url(#octetRealisticDarkTop)" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="6" y="46" width="52" height="6" rx="1.5" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <rect x="8" y="12" width="11" height="37" rx="5.5" fill="#1f2937" stroke="#94a3b8" strokeWidth={0.7} />
    <ellipse cx="13.5" cy="17.5" rx="3.6" ry="2.6" fill="#111827" />
    <ellipse cx="13.5" cy="43.5" rx="3.6" ry="2.6" fill="#111827" />
    <rect x="24" y="17.5" width="29" height="11" rx="1" fill="url(#octetRealisticLcd)" stroke="#0f172a" strokeWidth={0.6} />
    <g fill="#334155"><rect x="26" y="20" width="14" height="1.3" /><rect x="26" y="23" width="20" height="1.3" /><rect x="26" y="26" width="9" height="1.3" /></g>
    {portGrid({ x: 29, y: 31.5, columns: 3, rows: 4, stepX: 7, stepY: 3.6, width: 5, height: 2.6, rx: 0.8, fill: '#cbd5e1' })}
    <circle cx="53" cy="40" r="1" fill="#ef4444" />
  </>
)

/** Laser printer (the approved reference drawing). */
const printer = (
  <>
    <polygon points="12,22 52,22 48,15 16,15" fill="#e5e7eb" stroke="#9ca3af" />
    <rect x="8" y="22" width="48" height="23" rx="3" fill="url(#octetRealisticWhite)" stroke="#9ca3af" />
    <rect x="16" y="26" width="22" height="2.2" rx="1" fill="#374151" />
    <rect x="42" y="26" width="10" height="6" rx="1" fill="#0ea5e9" stroke="#0369a1" strokeWidth={0.6} />
    <circle cx="44" cy="36" r="1" fill="#4ade80" />
    <rect x="12" y="45" width="40" height="7" rx="1.5" fill="#cfd5dd" stroke="#9ca3af" />
    <rect x="26" y="47.5" width="12" height="1.6" rx=".8" fill="#9ca3af" />
  </>
)

/** Multifunction printer: taller body, scanner lid, document feeder with paper, touch panel. */
const multifunctionPrinter = (
  <>
    <polygon points="10,26 54,26 50,18 14,18" fill="#e5e7eb" stroke="#9ca3af" strokeLinejoin="round" />
    <polygon points="16,20 48,20 45,12 19,12" fill="#cbd2db" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="22,14 42,14 40,6 24,6" fill="#ffffff" stroke="#9ca3af" strokeWidth={0.6} />
    <g stroke="#cbd5e1" strokeWidth={0.6}><line x1="26" y1="9" x2="38" y2="9" /><line x1="26" y1="11.5" x2="36" y2="11.5" /></g>
    <rect x="8" y="26" width="48" height="26" rx="3" fill="url(#octetRealisticWhite)" stroke="#9ca3af" />
    <rect x="12" y="29" width="13" height="7" rx="1" fill="#1f2937" />
    <rect x="13.2" y="30.2" width="10.6" height="4.6" rx=".5" fill="#0ea5e9" />
    <circle cx="28.5" cy="32.5" r="1" fill="#4ade80" />
    <rect x="16" y="39" width="32" height="2.2" rx="1" fill="#374151" />
    <rect x="12" y="44" width="40" height="6" rx="1.5" fill="#cfd5dd" stroke="#9ca3af" />
    <rect x="26" y="46.2" width="12" height="1.6" rx=".8" fill="#9ca3af" />
  </>
)

export const REALISTIC_END_DEVICE_ART = {
  pc,
  laptop,
  smartphone,
  tablet,
  ipPhone,
  printer,
  multifunctionPrinter,
} satisfies Partial<Record<DeviceIconId, ReactNode>>
