// Colours per protocol (chips, envelopes on the map) and per action (event list, inspector).
import type { SimAction, SimProtocol } from './simulationServices'

export interface ProtocolStyle {
  /** Envelope fill on the map: the protocol's design token (src/index.css), so it follows the theme. */
  readonly fill: string
  /** Tailwind classes of the protocol chip. */
  readonly chip: string
}

export const PROTOCOL_STYLES: Readonly<Record<SimProtocol, ProtocolStyle>> = {
  arp: { fill: 'var(--color-packet-arp)', chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 ring-amber-300 dark:ring-amber-700' },
  icmp: { fill: 'var(--color-packet-icmp)', chip: 'bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-200 ring-violet-300 dark:ring-violet-700' },
  dhcp: { fill: 'var(--color-packet-dhcp)', chip: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 ring-emerald-300 dark:ring-emerald-700' },
  dns: { fill: 'var(--color-packet-dns)', chip: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-900 dark:text-cyan-200 ring-cyan-300 dark:ring-cyan-700' },
  http: { fill: 'var(--color-packet-http)', chip: 'bg-rose-100 dark:bg-rose-900/40 text-rose-900 dark:text-rose-200 ring-rose-300 dark:ring-rose-700' },
  tcp: { fill: 'var(--color-packet-tcp)', chip: 'bg-pink-100 dark:bg-pink-900/40 text-pink-900 dark:text-pink-200 ring-pink-300 dark:ring-pink-700' },
  udp: { fill: 'var(--color-packet-udp)', chip: 'bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-200 ring-teal-300 dark:ring-teal-700' },
  ipv4: { fill: 'var(--color-packet-ipv4)', chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 ring-blue-300 dark:ring-blue-700' },
  ethernet: { fill: 'var(--color-packet-ethernet)', chip: 'bg-surface-muted text-fg ring-border-strong' },
  hdlc: { fill: 'var(--color-packet-hdlc)', chip: 'bg-stone-100 dark:bg-stone-900/40 text-stone-800 dark:text-stone-200 ring-stone-300 dark:ring-stone-700' },
  telnet: { fill: 'var(--color-packet-telnet)', chip: 'bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200 ring-orange-300 dark:ring-orange-700' },
  ssh: { fill: 'var(--color-packet-ssh)', chip: 'bg-lime-100 dark:bg-lime-900/40 text-lime-900 dark:text-lime-200 ring-lime-300 dark:ring-lime-700' },
}

export const NO_PROTOCOL_CHIP = 'bg-surface text-fg-muted ring-border-strong'

/** Problem → red, consumed → green, held → amber, moving on → neutral. */
export function actionTone(action: SimAction): string {
  switch (action) {
    case 'dropped':
    case 'timedOut':
      return 'text-red-700 dark:text-red-300'
    case 'delivered':
    case 'replied':
      return 'text-emerald-700 dark:text-emerald-300'
    case 'buffered':
    case 'filtered':
      return 'text-amber-700 dark:text-amber-300'
    case 'created':
    case 'sent':
    case 'forwarded':
    case 'flooded':
      return 'text-fg'
  }
}

/** Background of the inspector's decision box. */
export function decisionTone(action: SimAction): string {
  switch (action) {
    case 'dropped':
    case 'timedOut':
      return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
    case 'delivered':
    case 'replied':
      return 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
    case 'buffered':
    case 'filtered':
      return 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
    case 'created':
    case 'sent':
    case 'forwarded':
    case 'flooded':
      return 'border-sky-200 dark:border-sky-800 bg-accent-muted text-sky-900 dark:text-sky-200'
  }
}
