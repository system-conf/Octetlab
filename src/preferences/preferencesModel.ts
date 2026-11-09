// The user's preferences (docs/PREFERENCES.md): one versioned record kept in localStorage. Every default
// equals the app's behaviour before preferences existed, so an empty record changes nothing.
import { z } from 'zod'
import type { SimProtocol } from '../sim/contract/SimEvent'
import { PLAY_SPEEDS } from '../sim/contract/SimulationView'

/** Version of the stored record; raise it (and add a migration in PreferencesCodec) on a breaking change. */
export const PREFERENCES_VERSION = 1

export const THEMES = ['light', 'dark', 'system'] as const
export const DENSITIES = ['comfortable', 'compact'] as const
/** Root font size multipliers offered by the Preferences screen (1 = the browser's size). */
export const FONT_SCALES = [0.875, 1, 1.125, 1.25, 1.5] as const
export const DEVICE_LABEL_MODES = ['name', 'model', 'both', 'none'] as const
export const PORT_LABEL_MODES = ['always', 'hover', 'never'] as const
/** Look of the devices (docs/DEVICE_STYLES.md): today's framed line icons, or illustrated pictures. */
export const DEVICE_STYLES = ['simple', 'classic', 'realistic'] as const
export const SIMULATION_MODES = ['realtime', 'simulation'] as const
/** Event-list protocols in chip order (same list as FILTER_PROTOCOLS in features/simulation). */
export const EVENT_FILTER_PROTOCOLS = [
  'arp', 'icmp', 'dhcp', 'dns', 'http', 'tcp', 'udp', 'ipv4', 'ethernet', 'hdlc',
] as const satisfies readonly SimProtocol[]
export const TERMINAL_FONT_SIZE = { min: 11, max: 20 } as const
export const TERMINAL_HISTORY_LENGTH = { min: 1, max: 256 } as const

function oneOf<const T extends readonly number[]>(values: T) {
  const allowed: readonly unknown[] = values
  return z.custom<T[number]>((value) => allowed.includes(value))
}

/** Protocols without duplicates, in chip order. */
const eventFilterProtocols = z
  .array(z.enum(EVENT_FILTER_PROTOCOLS))
  .transform((list) => EVENT_FILTER_PROTOCOLS.filter((protocol) => list.includes(protocol)))
  .readonly()

/** Strict schema of each field, by section. PreferencesCodec parses field by field (lenient). */
export const PREFERENCE_FIELDS = {
  appearance: {
    theme: z.enum(THEMES),
    fontScale: oneOf(FONT_SCALES),
    density: z.enum(DENSITIES),
    highContrast: z.boolean(),
  },
  map: {
    deviceLabels: z.enum(DEVICE_LABEL_MODES),
    portLabels: z.enum(PORT_LABEL_MODES),
    linkLights: z.boolean(),
    grid: z.boolean(),
    snap: z.boolean(),
    minimap: z.boolean(),
    deviceStyle: z.enum(DEVICE_STYLES),
  },
  simulation: {
    animation: z.boolean(),
    speed: oneOf(PLAY_SPEEDS),
    defaultMode: z.enum(SIMULATION_MODES),
    defaultEventFilters: eventFilterProtocols,
  },
  terminal: {
    cliDefaultForNetworkDevices: z.boolean(),
    fontSize: z.number().int().min(TERMINAL_FONT_SIZE.min).max(TERMINAL_FONT_SIZE.max),
    historyLength: z.number().int().min(TERMINAL_HISTORY_LENGTH.min).max(TERMINAL_HISTORY_LENGTH.max),
  },
  cables: {
    autoCable: z.boolean(),
  },
  data: {
    autosave: z.boolean(),
  },
} as const

/** Strict schema of the whole record (without the version). */
export const preferencesSchema = z.object({
  appearance: z.object(PREFERENCE_FIELDS.appearance).readonly(),
  map: z.object(PREFERENCE_FIELDS.map).readonly(),
  simulation: z.object(PREFERENCE_FIELDS.simulation).readonly(),
  terminal: z.object(PREFERENCE_FIELDS.terminal).readonly(),
  cables: z.object(PREFERENCE_FIELDS.cables).readonly(),
  data: z.object(PREFERENCE_FIELDS.data).readonly(),
}).readonly()

export type Preferences = z.output<typeof preferencesSchema>
export type PreferenceSection = keyof Preferences
export type AppearancePreferences = Preferences['appearance']
export type Theme = AppearancePreferences['theme']
export type Density = AppearancePreferences['density']
export type DeviceStyle = Preferences['map']['deviceStyle']

/** 'section.field', e.g. 'map.snap'. */
export type PreferencePath = {
  [S in PreferenceSection]: `${S}.${Extract<keyof Preferences[S], string>}`
}[PreferenceSection]

/** Value type at a path, e.g. PreferenceValue<'map.snap'> = boolean. */
export type PreferenceValue<P extends PreferencePath> = P extends `${infer S}.${infer K}`
  ? S extends PreferenceSection
    ? K extends keyof Preferences[S]
      ? Preferences[S][K]
      : never
    : never
  : never

/** Some fields of some sections; what PreferencesStore.update takes. */
export type PreferencesPatch = { readonly [S in PreferenceSection]?: Partial<Preferences[S]> }

/** Today's behaviour (see the "wired" list in docs/PREFERENCES.md before changing a default). */
export const DEFAULT_PREFERENCES: Preferences = {
  appearance: { theme: 'light', fontScale: 1, density: 'comfortable', highContrast: false },
  map: { deviceLabels: 'name', portLabels: 'always', linkLights: true, grid: true, snap: false, minimap: true, deviceStyle: 'simple' },
  simulation: { animation: true, speed: 1, defaultMode: 'realtime', defaultEventFilters: EVENT_FILTER_PROTOCOLS },
  terminal: { cliDefaultForNetworkDevices: false, fontSize: 13, historyLength: 10 },
  cables: { autoCable: true },
  data: { autosave: true },
}

export const PREFERENCE_SECTIONS: readonly PreferenceSection[] = ['appearance', 'map', 'simulation', 'terminal', 'cables', 'data']
