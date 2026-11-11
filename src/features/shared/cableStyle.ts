import type { CableTool } from '../../domain'

/** Cables drawn as a coloured line or plug (the Wi-Fi association and the "auto" tool have no colour). */
export type ColouredCable = Exclude<CableTool, 'auto' | 'wireless'>

/**
 * Text colour class (use with `currentColor`) and dash of each cable: our own colour code, readable
 * on white and in dark mode. Shared by the cable tool glyphs and the plugs of the device front panel.
 */
export const CABLE_STYLE: Readonly<Record<ColouredCable, { tone: string; dash?: string }>> = {
  copperStraight: { tone: 'text-slate-700 dark:text-slate-300' },
  copperCross: { tone: 'text-slate-700 dark:text-slate-300', dash: '3 2' },
  fiber: { tone: 'text-orange-600 dark:text-orange-400' },
  serial: { tone: 'text-red-600 dark:text-red-400' },
  console: { tone: 'text-sky-600 dark:text-sky-400' },
  coaxial: { tone: 'text-blue-900 dark:text-blue-300' },
}
