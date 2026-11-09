// Classic pictures of the WAN side (64×64): the internet cloud (approved reference) and the two
// modems. DSL = flat beige box with a telephone handset mark and phone cord; cable = upright grey
// box with a rounded top and a screw-on coax connector.
import type { ReactNode } from 'react'

const internetCloud: ReactNode = (
  <>
    <g fill="url(#octetClassicCloud)" stroke="#60a5fa" strokeWidth="1.2">
      <circle cx="21" cy="37" r="11" /><circle cx="34" cy="28" r="14" /><circle cx="47" cy="37" r="10" />
    </g>
    <g fill="url(#octetClassicCloud)">
      <rect x="21" y="34" width="26" height="13" /><circle cx="21" cy="37" r="10.4" /><circle cx="34" cy="28" r="13.4" /><circle cx="47" cy="37" r="9.4" />
    </g>
    <path d="M10.5 41 Q12 48 21 48 H47 Q57 47 57 38" fill="none" stroke="#60a5fa" strokeWidth="1.2" />
  </>
)

const BEIGE_OUTLINE = '#7a7362'

const dslModem: ReactNode = (
  <>
    <path d="M10 42 C2 44 8 50 4 54 C1 57 6 59 10 58" fill="none" stroke="#78716c" strokeWidth="1.8" strokeLinecap="round" />
    <polygon points="16,26 58,26 52,34 10,34" fill="#f3efe4" stroke={BEIGE_OUTLINE} />
    <rect x="10" y="34" width="42" height="14" rx="1" fill="url(#octetClassicBeige)" stroke={BEIGE_OUTLINE} />
    <polygon points="52,34 58,26 58,40 52,48" fill="#bdb5a0" stroke={BEIGE_OUTLINE} />
    <g stroke="#3f3a2f" strokeWidth=".5">
      <circle cx="15" cy="41" r="1.6" fill="#22c55e" /><circle cx="20" cy="41" r="1.6" fill="#22c55e" /><circle cx="25" cy="41" r="1.6" fill="#f59e0b" />
    </g>
    <path d="M31 41.5 V39.5 Q31 36 39.5 36 Q48 36 48 39.5 V41.5 H44.5 V40.2 Q44.5 39 39.5 39 Q34.5 39 34.5 40.2 V41.5 Z" fill="#3f3a2f" />
    <rect x="34" y="40.5" width="11" height="4.5" rx="1.2" fill="#3f3a2f" />
  </>
)

const GREY_OUTLINE = '#4b5563'

const cableModem: ReactNode = (
  <>
    <path d="M54 44 C60 46 60 52 54 54 C48 56 50 60 56 60" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M24 9 Q27 5 35 5 Q46 5 46 13 V52 L40 56 Z" fill="#a8afba" stroke={GREY_OUTLINE} />
    <path d="M18 18 Q18 9 29 9 Q40 9 40 18 V56 H18 Z" fill="url(#octetClassicGrey)" stroke={GREY_OUTLINE} />
    <g stroke="#374151" strokeWidth=".5">
      <circle cx="24" cy="22" r="1.7" fill="#22c55e" /><circle cx="24" cy="28" r="1.7" fill="#22c55e" />
      <circle cx="24" cy="34" r="1.7" fill="#22c55e" /><circle cx="24" cy="40" r="1.7" fill="#f59e0b" />
    </g>
    <g stroke="#9ca3af"><line x1="30" y1="22" x2="35" y2="22" /><line x1="30" y1="28" x2="35" y2="28" /><line x1="30" y1="34" x2="35" y2="34" /><line x1="30" y1="40" x2="35" y2="40" /></g>
    <rect x="46" y="41" width="4" height="6" fill="#c9a227" stroke="#7a5d0c" strokeWidth=".8" />
    <polygon points="50,39.5 54,39.5 55.5,44 54,48.5 50,48.5" fill="#e2b93b" stroke="#7a5d0c" strokeWidth=".8" />
    <circle cx="52.5" cy="44" r="1.2" fill="#f8fafc" stroke="#7a5d0c" strokeWidth=".6" />
  </>
)

export const classicWanArt = {
  internetCloud,
  dslModem,
  cableModem,
} as const satisfies Readonly<Record<string, ReactNode>>
