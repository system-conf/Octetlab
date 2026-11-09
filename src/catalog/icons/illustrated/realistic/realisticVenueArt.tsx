// Realistic pictures of the shop and venue devices: IP camera, POS, kitchen display, smart TV.
import type { ReactNode } from 'react'
import type { DeviceIconId } from '../../deviceIconTypes'

const DARK_EDGE = '#64748b'

/** White bullet camera on a wall bracket, lens pointing down-right. */
const ipCamera = (
  <>
    <rect x="5" y="25" width="7" height="24" rx="1.5" fill="url(#octetRealisticWhite)" stroke="#9ca3af" strokeWidth={0.7} />
    <polygon points="11,34 23,28.5 26,32.5 11,41" fill="#d6dbe2" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <g transform="rotate(16 36 26)">
      <rect x="18" y="18.5" width="33" height="15" rx="7.5" fill="url(#octetRealisticWhite)" stroke="#9ca3af" strokeWidth={0.7} />
      <path d="M15 20 Q15 15 21 15 H55 V20.5 H20 Z" fill="#f1f5f9" stroke="#9ca3af" strokeWidth={0.7} strokeLinejoin="round" />
      <ellipse cx="51" cy="26" rx="3.4" ry="7" fill="#1f2937" stroke="#4b5563" strokeWidth={0.6} />
      <circle cx="51.6" cy="26" r="3.2" fill="#0b0f16" stroke="#334155" strokeWidth={0.6} />
      <circle cx="50.8" cy="25" r="1" fill="#60a5fa" />
      <circle cx="24" cy="29" r=".8" fill="#4ade80" />
    </g>
  </>
)

/** Point-of-sale: touchscreen with item buttons on a stand, small receipt printer beside it. */
const pos = (
  <>
    <polygon points="20,35 26,35 27.5,46 18.5,46" fill="#6b7280" stroke="#4b5563" strokeWidth={0.5} />
    <rect x="11" y="46" width="24" height="4.5" rx="2" fill="#9ca3af" stroke="#6b7280" strokeWidth={0.6} />
    <rect x="5" y="8" width="35" height="28" rx="2" fill="#111827" stroke={DARK_EDGE} strokeWidth={0.7} />
    <rect x="7.5" y="10.5" width="30" height="23" fill="#0f172a" />
    <g>
      <rect x="9" y="12" width="8" height="5.6" rx=".6" fill="#22c55e" /><rect x="18.4" y="12" width="8" height="5.6" rx=".6" fill="#f59e0b" />
      <rect x="9" y="19" width="8" height="5.6" rx=".6" fill="#38bdf8" /><rect x="18.4" y="19" width="8" height="5.6" rx=".6" fill="#f472b6" />
      <rect x="9" y="26" width="8" height="5.6" rx=".6" fill="#a78bfa" /><rect x="18.4" y="26" width="8" height="5.6" rx=".6" fill="#ef4444" />
    </g>
    <rect x="28" y="12" width="8" height="19.6" rx=".6" fill="#f8fafc" />
    <g fill="#94a3b8"><rect x="29.2" y="14" width="5.6" height="1" /><rect x="29.2" y="16.5" width="4.4" height="1" /><rect x="29.2" y="19" width="5.6" height="1" /></g>
    <rect x="29.2" y="27.5" width="5.6" height="2.6" rx=".5" fill="#22c55e" />
    <path d="M45 37 V25 l1.5 -1.2 1.5 1.2 1.5 -1.2 1.5 1.2 1.5 -1.2 1.5 1.2 V37 Z" fill="#ffffff" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <g stroke="#cbd5e1" strokeWidth={0.7}><line x1="46.5" y1="28" x2="52.5" y2="28" /><line x1="46.5" y1="30.5" x2="51.5" y2="30.5" /><line x1="46.5" y1="33" x2="52.5" y2="33" /></g>
    <polygon points="42,38 56,38 59,35 45,35" fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <polygon points="56,38 59,35 59,48 56,51" fill="#cbd2db" stroke="#9ca3af" strokeWidth={0.6} strokeLinejoin="round" />
    <rect x="42" y="38" width="14" height="13" rx="1.5" fill="url(#octetRealisticWhite)" stroke="#9ca3af" strokeWidth={0.6} />
    <rect x="44" y="40" width="10" height="1.2" rx=".6" fill="#475569" />
    <circle cx="45" cy="47.5" r=".9" fill="#4ade80" />
  </>
)

/** Wall-mounted kitchen display showing three order tickets (green, amber, red headers). */
const kitchenDisplay = (
  <>
    <rect x="27" y="3" width="10" height="3" rx="1" fill="#9ca3af" stroke="#6b7280" strokeWidth={0.6} />
    <rect x="30.5" y="5.5" width="3" height="7" fill="#6b7280" />
    <rect x="4" y="12" width="56" height="38" rx="2" fill="#111827" stroke={DARK_EDGE} strokeWidth={0.7} />
    <rect x="6.5" y="14.5" width="51" height="33" fill="#1e293b" />
    <g fill="#f8fafc">
      <rect x="8.5" y="16.5" width="14.6" height="29" rx="1" /><rect x="24.7" y="16.5" width="14.6" height="29" rx="1" /><rect x="40.9" y="16.5" width="14.6" height="29" rx="1" />
    </g>
    <rect x="8.5" y="16.5" width="14.6" height="4.6" rx="1" fill="#22c55e" />
    <rect x="24.7" y="16.5" width="14.6" height="4.6" rx="1" fill="#f59e0b" />
    <rect x="40.9" y="16.5" width="14.6" height="4.6" rx="1" fill="#ef4444" />
    <g fill="#94a3b8">
      <rect x="10.3" y="24" width="10" height="1.4" /><rect x="10.3" y="27.5" width="7" height="1.4" /><rect x="10.3" y="31" width="9" height="1.4" />
      <rect x="26.5" y="24" width="9" height="1.4" /><rect x="26.5" y="27.5" width="11" height="1.4" /><rect x="26.5" y="31" width="6" height="1.4" /><rect x="26.5" y="34.5" width="9" height="1.4" />
      <rect x="42.7" y="24" width="10" height="1.4" /><rect x="42.7" y="27.5" width="8" height="1.4" />
    </g>
  </>
)

/** Thin, wide smart TV on two feet, showing a picture. */
const smartTv = (
  <>
    <g fill="#4b5563" stroke="#374151" strokeWidth={0.5} strokeLinejoin="round">
      <polygon points="12,46 15,46 11.5,53 8,53" /><polygon points="49,46 52,46 56,53 52.5,53" />
    </g>
    <rect x="3" y="11" width="58" height="35" rx="1.5" fill="#0b0f16" stroke={DARK_EDGE} strokeWidth={0.7} />
    <rect x="4.5" y="12.5" width="55" height="32" fill="url(#octetRealisticTvScreen)" />
    <circle cx="44" cy="31" r="4.5" fill="#fde68a" opacity=".9" />
    <path d="M4.5 38 Q 16 29 28 35 T 59.5 32 V44.5 H4.5 Z" fill="#1e1b4b" opacity=".75" />
    <polygon points="4.5,12.5 26,12.5 14,44.5 4.5,44.5" fill="#ffffff" opacity=".07" />
  </>
)

export const REALISTIC_VENUE_ART = {
  ipCamera,
  pos,
  kitchenDisplay,
  smartTv,
} satisfies Partial<Record<DeviceIconId, ReactNode>>
