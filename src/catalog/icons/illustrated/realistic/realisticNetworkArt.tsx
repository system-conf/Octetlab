// Realistic pictures of the LAN hardware: router, switches, hub, firewall, access points.
// 64×64 viewBox, slightly-from-above 3/4 view; dark boxes get a lighter edge (#64748b) and light
// boxes a grey outline so they read on both the light and the dark canvas.
import type { ReactNode } from 'react'
import type { DeviceIconId } from '../../deviceIconTypes'
import { ledRow, portGrid } from './realisticParts'

const DARK_EDGE = '#64748b'

/** Small desktop router: rounded dark box, LED row, four LAN ports and one amber WAN port. */
const router = (
  <>
    <polygon points="8,31 50,31 58,23 16,23" fill="url(#octetRealisticDarkTop)" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="50,31 58,23 58,36 50,44" fill="#111318" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="8" y="31" width="42" height="13" rx="2.5" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <g stroke="#262c36" strokeWidth={1.1} strokeLinecap="round">
      <line x1="23" y1="29.4" x2="28" y2="24.6" /><line x1="27" y1="29.4" x2="32" y2="24.6" />
      <line x1="31" y1="29.4" x2="36" y2="24.6" /><line x1="35" y1="29.4" x2="40" y2="24.6" />
    </g>
    {ledRow(11.5, 33.6, 3, 0.7, ['#4ade80', '#4ade80', '#4ade80', '#38bdf8', '#fbbf24'])}
    {portGrid({ x: 11, y: 35.8, columns: 4, stepX: 6.5, width: 5, height: 4.6, fill: '#05070a', stroke: '#6b7280', strokeWidth: 0.6 })}
    <rect x="38" y="35.8" width="5" height="4.6" fill="#05070a" stroke="#f59e0b" strokeWidth={1} />
    <circle cx="46.5" cy="38" r="1.6" fill="none" stroke="#60a5fa" strokeWidth={0.9} />
  </>
)

/** Silver unmanaged 1U switch with two rows of ports (the approved reference drawing). */
const switchArt = (
  <>
    <polygon points="4,30 54,30 60,24 10,24" fill="#e2e5ea" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="4" y="30" width="50" height="13" fill="url(#octetRealisticSilverFront)" stroke="#6b7280" strokeWidth={0.6} />
    <polygon points="54,30 60,24 60,37 54,43" fill="#6b7280" stroke="#4b5563" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="4" y="30" width="2.5" height="13" fill="#7c838e" /><rect x="51.5" y="30" width="2.5" height="13" fill="#7c838e" />
    {portGrid({ x: 8, y: 32, columns: 8, rows: 2, stepX: 4, stepY: 5.4, width: 3.4, height: 3.6, fill: '#1b1f26' })}
    <g fill="#4ade80"><circle cx="9.7" cy="31.2" r=".55" /><circle cx="13.7" cy="31.2" r=".55" /><circle cx="21.7" cy="31.2" r=".55" /><circle cx="29.7" cy="31.2" r=".55" /></g>
    <rect x="42" y="33" width="7" height="3" rx=".5" fill="#1b1f26" />
    <circle cx="43.5" cy="39" r=".9" fill="#4ade80" /><circle cx="46.5" cy="39" r=".9" fill="#fbbf24" />
  </>
)

/** Dark managed layer-3 switch: two rows of ports plus four silver-edged SFP cages. */
const l3Switch = (
  <>
    <polygon points="4,30 54,30 60,24 10,24" fill="url(#octetRealisticDarkTop)" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="4" y="30" width="50" height="13" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <polygon points="54,30 60,24 60,37 54,43" fill="#111318" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="4" y="30" width="2" height="13" fill="#4b5563" /><rect x="52" y="30" width="2" height="13" fill="#4b5563" />
    {portGrid({ x: 8, y: 32, columns: 8, rows: 2, stepX: 4, stepY: 5.4, width: 3.4, height: 3.6, fill: '#05070a', stroke: '#6b7280', strokeWidth: 0.4 })}
    {portGrid({ x: 41.5, y: 32.2, columns: 2, rows: 2, stepX: 4.8, stepY: 5.2, width: 4, height: 3.2, fill: '#0b0d11', stroke: '#e5e7eb', strokeWidth: 0.6 })}
    <g fill="#4ade80"><circle cx="9.7" cy="31.2" r=".55" /><circle cx="17.7" cy="31.2" r=".55" /><circle cx="25.7" cy="31.2" r=".55" /><circle cx="33.7" cy="31.2" r=".55" /></g>
    <circle cx="43.5" cy="31.1" r=".55" fill="#38bdf8" /><circle cx="48.3" cy="31.1" r=".55" fill="#38bdf8" />
  </>
)

/** Small beige plastic hub with five ports and an LED over each. */
const hub = (
  <>
    <polygon points="10,32 48,32 54,26 16,26" fill="#f4f1ea" stroke="#a8a29e" strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="48,32 54,26 54,38 48,44" fill="#c9c2b2" stroke="#a8a29e" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="10" y="32" width="38" height="12" rx="1.5" fill="url(#octetRealisticPlastic)" stroke="#a8a29e" strokeWidth={0.6} />
    {ledRow(16.2, 35, 6.2, 0.7, ['#4ade80', '#fbbf24', '#4ade80', '#4ade80', '#fbbf24'])}
    {portGrid({ x: 14, y: 37.5, columns: 5, stepX: 6.2, width: 4.4, height: 4, fill: '#1b1f26', rx: 0.3 })}
    <circle cx="45" cy="36" r=".9" fill="#22c55e" />
  </>
)

/** Red/orange 1U firewall appliance: shield badge, a few ports, small status display. */
const firewall = (
  <>
    <polygon points="4,30 54,30 60,24 10,24" fill="url(#octetRealisticRedTop)" stroke="#7f1d1d" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="4" y="30" width="50" height="13" fill="url(#octetRealisticRedFront)" stroke="#7f1d1d" strokeWidth={0.6} />
    <polygon points="54,30 60,24 60,37 54,43" fill="#7f1d1d" stroke="#5f1414" strokeWidth={0.6} strokeLinejoin="round" />
    <path d="M12 31.8 L16.5 33.2 V36.8 Q16.5 40 12 41.6 Q7.5 40 7.5 36.8 V33.2 Z" fill="#fff7ed" stroke="#7f1d1d" strokeWidth={0.5} />
    <path d="M8.2 36.4 H15.8 M12 33 V36.4 M10 36.4 V40 M14 36.4 V40" stroke="#dc2626" strokeWidth={0.7} />
    {portGrid({ x: 20, y: 34.5, columns: 4, stepX: 5.2, width: 4.2, height: 4.6, fill: '#05070a', stroke: '#450a0a', strokeWidth: 0.5 })}
    <rect x="42" y="33" width="9" height="3.6" rx=".5" fill="#0b0f16" />
    <rect x="43" y="34.3" width="5" height="1" fill="#4ade80" />
    {ledRow(43.5, 39.5, 3, 0.8, ['#4ade80', '#fbbf24', '#4ade80'])}
  </>
)

/** White ceiling access point (the approved reference drawing). */
const accessPoint = (
  <>
    <g fill="none" stroke="#94a3b8" strokeWidth={1.8} strokeLinecap="round" opacity=".8">
      <path d="M26 20 A9 9 0 0 1 38 20" /><path d="M21 15 A16 16 0 0 1 43 15" />
    </g>
    <path d="M10 36 V40 A22 8 0 0 0 54 40 V36 Z" fill="#c4cad3" stroke="#9ca3af" strokeWidth={0.6} />
    <ellipse cx="32" cy="36" rx="22" ry="8" fill="url(#octetRealisticWhite)" stroke="#9ca3af" />
    <ellipse cx="32" cy="36" rx="5" ry="1.8" fill="none" stroke="#38bdf8" strokeWidth={1.4} />
  </>
)

/** Home wireless router: flat black body with three upright antennas and a front LED row. */
const wirelessRouter = (
  <>
    <g fill="#1f2937" stroke={DARK_EDGE} strokeWidth={0.6}>
      <rect x="14.5" y="10" width="3.4" height="25" rx="1.7" transform="rotate(-8 16.2 34)" />
      <rect x="32.3" y="6" width="3.4" height="27" rx="1.7" />
      <rect x="50.5" y="10" width="3.4" height="25" rx="1.7" transform="rotate(8 52.2 34)" />
    </g>
    <polygon points="8,40 50,40 58,32 16,32" fill="url(#octetRealisticDarkTop)" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="50,40 58,32 58,40 50,48" fill="#111318" stroke={DARK_EDGE} strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="8" y="40" width="42" height="8" rx="2" fill="url(#octetRealisticDarkFront)" stroke={DARK_EDGE} strokeWidth={0.6} />
    <g fill="#111318" stroke={DARK_EDGE} strokeWidth={0.5}>
      <circle cx="17.4" cy="34" r="1.6" /><circle cx="34" cy="33" r="1.6" /><circle cx="50.6" cy="34" r="1.6" />
    </g>
    {ledRow(14, 44, 3.4, 0.75, ['#4ade80', '#38bdf8', '#38bdf8', '#4ade80', '#4ade80', '#4ade80'])}
  </>
)

export const REALISTIC_NETWORK_ART = {
  router,
  switch: switchArt,
  l3Switch,
  hub,
  firewall,
  accessPoint,
  wirelessRouter,
} satisfies Partial<Record<DeviceIconId, ReactNode>>
