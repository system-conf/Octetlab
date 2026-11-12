// Every translation namespace (= one JSON file per language in src/locales/<code>/).
// Adding a namespace: add the JSON files for every language, add the name here and its type
// in typedResources.d.ts. The parity test checks this list against the en folder.

export const namespaces = [
  'common',
  'landing',
  'exercise',
  'results',
  'device',
  'map',
  'terminal',
  'session',
  'engine',
  'exercises',
  'catalog',
  'workspace',
  'lab',
  'deviceConfig',
  'simulation',
  'design',
  'designBriefs',
  // SL0 (sample labs contract): docs/SAMPLE_LABS.md
  'samples',
  // K4 (CLI contract): docs/CLI.md
  'cli',
  // C4 (host commands): src/cli/host
  'hostCli',
  // PU (Preferences screen): docs/PREFERENCES.md
  'preferences',
  // Live labs: docs/LIVE_LABS.md
  'live',
  // Pack 5.2 (docs/SECURITY_PACK.md): one namespace per agent
  'acl',
  'nat',
  'remoteAccess',
] as const

export type Namespace = (typeof namespaces)[number]

export const defaultNamespace = 'common' satisfies Namespace
