// Public API of the preferences (docs/PREFERENCES.md).
export {
  DEFAULT_PREFERENCES,
  DENSITIES,
  DEVICE_LABEL_MODES,
  DEVICE_STYLES,
  EVENT_FILTER_PROTOCOLS,
  FONT_SCALES,
  PORT_LABEL_MODES,
  PREFERENCE_SECTIONS,
  PREFERENCES_VERSION,
  SIMULATION_MODES,
  TERMINAL_FONT_SIZE,
  TERMINAL_HISTORY_LENGTH,
  THEMES,
  type AppearancePreferences,
  type Density,
  type DeviceStyle,
  type PreferencePath,
  type PreferenceSection,
  type Preferences,
  type PreferencesPatch,
  type PreferenceValue,
  type Theme,
} from './preferencesModel'
export { PREFERENCES_FILE_KIND, type PreferencesImportResult } from './PreferencesCodec'
export { PREFERENCES_STORAGE_KEY, PreferencesStore } from './PreferencesStore'
export { ThemeApplier } from './ThemeApplier'
export { appPreferencesStore } from './preferencesContext'
export { usePreference, usePreferences, usePreferencesStore } from './usePreferences'
export { default as PreferencesProvider } from './PreferencesProvider'
