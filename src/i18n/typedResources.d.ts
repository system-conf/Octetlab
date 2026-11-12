// Typed translation keys: resources are typed from the en JSON files, so t('missing.key') is a
// compile error. Keep in sync with namespaces.ts.
import 'i18next'
import type catalog from '../locales/en/catalog.json'
import type common from '../locales/en/common.json'
import type device from '../locales/en/device.json'
import type deviceConfig from '../locales/en/deviceConfig.json'
import type engine from '../locales/en/engine.json'
import type exercise from '../locales/en/exercise.json'
import type exercises from '../locales/en/exercises.json'
import type lab from '../locales/en/lab.json'
import type landing from '../locales/en/landing.json'
import type map from '../locales/en/map.json'
import type results from '../locales/en/results.json'
import type session from '../locales/en/session.json'
import type simulation from '../locales/en/simulation.json'
import type terminal from '../locales/en/terminal.json'
import type workspace from '../locales/en/workspace.json'

export interface AppResources {
  common: typeof common
  landing: typeof landing
  exercise: typeof exercise
  results: typeof results
  device: typeof device
  map: typeof map
  terminal: typeof terminal
  session: typeof session
  engine: typeof engine
  exercises: typeof exercises
  catalog: typeof catalog
  workspace: typeof workspace
  lab: typeof lab
  deviceConfig: typeof deviceConfig
  simulation: typeof simulation
  design: typeof import('../locales/en/design.json')
  designBriefs: typeof import('../locales/en/designBriefs.json')
  // SL0 (sample labs contract): docs/SAMPLE_LABS.md
  samples: typeof import('../locales/en/samples.json')
  // K4 (CLI contract): docs/CLI.md
  cli: typeof import('../locales/en/cli.json')
  // C4 (host commands): src/cli/host
  hostCli: typeof import('../locales/en/hostCli.json')
  // PU (Preferences screen): docs/PREFERENCES.md
  preferences: typeof import('../locales/en/preferences.json')
  // Live labs: docs/LIVE_LABS.md
  live: typeof import('../locales/en/live.json')
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: AppResources
  }
}
