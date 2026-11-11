# Preferences and design tokens

The user's preferences (BACKLOG items 14 and 15): one versioned record in localStorage, a small store with
React hooks, a theme applier for `<html>`, and semantic colour tokens in `src/index.css`. The dark-mode
and Preferences-screen work builds on this contract; change it here first.

Code: `src/preferences/` (public API: `src/preferences/index.ts`). Import from `'../../preferences'`,
not from the individual files.

## 1. Model (`preferencesModel.ts`)

Every default equals the app's behaviour before preferences existed, so an empty record changes
nothing. Do not change a default without changing the behaviour it describes (and this table).

| Path | Type / values | Default | Status |
| --- | --- | --- | --- |
| `appearance.theme` | `'light' \| 'dark' \| 'system'` | `'light'` | **Wired**: ThemeApplier + index.html script set `class="dark"`. Components still use fixed light classes; the dark-mode track moves them to tokens, then may change the default to `'system'`. |
| `appearance.fontScale` | `0.875 \| 1 \| 1.125 \| 1.25 \| 1.5` (`FONT_SCALES`) | `1` | **Wired**: root `font-size` (%), so every `rem` scales. |
| `appearance.density` | `'comfortable' | 'compact'` | `'comfortable'` | **Wired**: `data-density` on `<html>`; `index.css` shrinks Tailwind's `--spacing` by 12.5 % under `compact` and resets it inside `.react-flow` (the map keeps its geometry). |
| `appearance.highContrast` | boolean | `false` | **Wired**: `data-contrast="more"` + token overrides (§5); visible wherever components use tokens. |
| `appearance.paletteLayout` | `'sidebar' \| 'bottomBar'` (`PALETTE_LAYOUTS`) | `'sidebar'` | **Wired**: `WorkspacePaletteSlot` (WorkspaceView) shows the device palette from `md` up either as today's left sidebar (`DevicePalette`) or as a Packet Tracer-style strip under the canvas (`DevicePaletteBar`: labelled categories + search, one sideways-scrolling tile row, details card). Both share `useDevicePalette` / `PaletteContents`; phones keep the drawer. Choice in Appearance with `PaletteLayoutPreview`. |
| `map.deviceLabels` | `'name' | 'model' | 'both' | 'none'` | `'name'` | **Wired**: `WorkspaceDeviceNode` (`deviceLabelLines`); the node's aria-label keeps the name. |
| `map.portLabels` | `'always' | 'hover' | 'never'` | `'always'` | **Wired**: `LinkEdge` (`portLabelClassName`); `hover` shows them while the cable is hovered, selected or focused. |
| `map.linkLights` | boolean | `true` | **Wired**: `LinkEdge` draws the LEDs only when on. |
| `map.grid` | boolean | `true` | **Wired**: `WorkspaceCanvas` renders the dot `Background` only when on. |
| `map.snap` | boolean | `false` | **Wired**: `useSnapPreference` (canvas toolbar "snap") and the Map tab. |
| `map.minimap` | boolean | `true` | **Wired**: `WorkspaceCanvas` (still hidden below `md`, while cabling and while dragging). |
| `map.deviceStyle` | `'simple' \| 'classic' \| 'realistic'` (`DEVICE_STYLES`) | `'simple'` | **Wired**: `DeviceVisual` (catalog) in `WorkspaceDeviceNode`, the palette (`ModelTileGrid`, `ModelDetailCard`) and the `DeviceInfoPanel` header; `IllustratedIconDefs` is mounted once in `main.tsx`. `HandoverTopology` (print) stays simple. See docs/DEVICE_STYLES.md. |
| `simulation.animation` | boolean | `true` | **Wired**: `SimulationMapLayer`; off works like reduced motion (packets at the step's end, no realtime replay). |
| `simulation.speed` | `PLAY_SPEEDS` (`0.25 … 4`) | `1` | **Wired**: `usePlayback` uses the preference as its speed, so the panel's slider and the tab share and remember it. |
| `simulation.defaultMode` | `'realtime' | 'simulation'` | `'realtime'` | **Wired**: `useSimulation` reads it once at mount (labs, exercises, samples, designs); Simulation builds the engine at once even for on-demand labs. |
| `simulation.defaultEventFilters` | `SimProtocol[]`, chip order, no duplicates | all protocols | **Wired**: `useSimulation`'s starting filter (read once at mount). |
| `terminal.cliDefaultForNetworkDevices` | boolean | `false` | **Wired**: `useDeviceTabState` (WorkspaceView) starts on CLI; devices without a CLI fall back to Info; follows a change made while the workspace is open. |
| `terminal.fontSize` | integer px, 11–20 | `13` | **Wired**: `CliConsoleTab` and `TerminalTab` (`--terminal-font-size`; phone inputs keep 16 px against iOS zoom). |
| `terminal.historyLength` | integer, 1–256 | `10` | **Wired, partly**: host terminal (`TerminalTab`, before: unbounded) keeps this many; device CLI Up / Down walk at most this many, but the CLI shell itself keeps 10 per mode (`CliHistory.HISTORY_SIZE`), so values above 10 need `terminal history size` support in the CLI core (the hint says so). |
| `cables.autoCable` | boolean | `true` | **Wired**: `useOfferedCableTools` (toolbar, cable palette, the cable shortcut picks the first offered tool). |
| `data.autosave` | boolean | `true` | **Wired**: `LabWorkspaceScreen` passes it to `useLabDocument` (free lab only; exercises, designs and samples never autosave). |

The language is **not** a preference here: i18next keeps it (`src/i18n`, its own localStorage key);
the Preferences screen's Language tab calls `changeLanguage`.

Wiring a "stored, not yet used" field: read it with `usePreference(path)` where the behaviour lives,
and move the row above to "Wired" in the same change.

Adding a field: add its strict schema to `PREFERENCE_FIELDS`, its default (= current behaviour) to
`DEFAULT_PREFERENCES`, a row here, and UI text in both `src/locales/tr` and `src/locales/en`.

## 2. Storage format and parsing (`PreferencesCodec.ts`)

- Key `agArizaLab.preferences`. Value: `{ "version": 1, <section>: { <field>: value } }` with **only the
  fields that differ from the defaults** (the key is removed when nothing differs). A later change of a
  default therefore reaches everyone who never chose that field.
- **Lenient parse**: every field is checked on its own against its strict schema. Invalid or missing
  fields take their default; valid ones are kept; unknown fields and sections are dropped. The parse
  reports the invalid paths (`ignored`). One bad value never resets the rest.
- **Version**: `PREFERENCES_VERSION = 1`. A breaking change raises it and adds a step to
  `PreferencesCodec.migrate`. Records from a newer version are still parsed leniently (known fields kept).
- **Migration**: the old key `agArizaLab.workspace.snap` (`'on'`/`'off'`) seeds `map.snap` when no
  preferences record exists yet, and is removed on load.
- **Export file**: complete and readable: `{ "kind": "agArizaLab.preferences", "version": 1, ...all sections }`.
  **Import** replaces all preferences: fields the file does not name take their defaults, invalid ones too
  (listed in `ignored`). Refused with `invalidJson` (not JSON) or `notPreferences` (not an object, a
  different `kind`, or no known section).

## 3. Store (`PreferencesStore.ts`)

```ts
const store = PreferencesStore.fromBrowser()     // memory-only (console.warn) if localStorage fails
store.getSnapshot(): Preferences                  // immutable; same object until a change
store.get('map.snap'): boolean                    // typed by path
store.set('map.snap', true)                       // saves, notifies; throws on an invalid value
store.update({ map: { grid: false }, terminal: { fontSize: 14 } })   // several fields, one notification
store.reset()                                     // defaults; stored record removed
store.exportJson(): string                        // Data tab: export
store.importJson(text): PreferencesImportResult   // { ok: true, preferences, ignored } | { ok: false, reason }
store.subscribe(listener): () => void             // own changes and other tabs
store.listenToOtherTabs(window): () => void       // 'storage' event; adopts, never writes back
```

`getSnapshot` and `subscribe` are bound (fit `useSyncExternalStore`). Unchanged sections keep their
object identity across changes, so a subscriber to one field re-renders only when that field changes.
No-op writes do not notify.

## 4. React and the theme

- `main.tsx` wraps `<App />` in `<PreferencesProvider>`. The provider uses the app store, connects
  `ThemeApplier` and cross-tab sync. Tests pass `store={new PreferencesStore(memoryStorage)}`.
- Hooks (work without a provider too; they then use the app store, without theme/cross-tab wiring):
  - `usePreference(path)` → `[value, setValue]`, like `useState`; re-renders only for that field.
  - `usePreferences()` → the whole `Preferences` (re-renders on any change).
  - `usePreferencesStore()` → the store, for `reset` / `exportJson` / `importJson` / `update`.
- `ThemeApplier` writes on `<html>`:
  - `class="dark"` for `dark`, or for `system` while `(prefers-color-scheme: dark)` matches (live: it
    follows OS changes);
  - `data-density="comfortable|compact"`;
  - `data-contrast="more"` when high contrast is on (removed otherwise);
  - `style.fontSize = "<scale × 100>%"` (cleared at scale 1).
- **No flash**: the inline `<script id="preferencesBoot">` in `index.html` reads the same key and sets
  the same attributes before the first paint. It must stay in step with `ThemeApplier.apply`;
  `ThemeApplier.test.ts` runs both on the same inputs and compares.
- `color-scheme` (scrollbars, form controls) follows the `dark` class in `index.css`.

## 5. Design tokens (`src/index.css`)

`@custom-variant dark (&:where(.dark, .dark *));` — Tailwind's `dark:` follows the class, not the media
query. Tokens are `@theme static` colours: utilities `bg-<token>`, `text-<token>`, `border-<token>`,
`ring-<token>`, `fill-<token>`, `stroke-<token>`, and `var(--color-<token>)` in inline styles, SVG
attributes and props such as React Flow's `<Background color>`. Light values equal today's colours;
`.dark`, `[data-contrast="more"]` and `.dark[data-contrast="more"]` override them.

| Token | Use | Light | Dark |
| --- | --- | --- | --- |
| `page` | app background (body) | slate-50 | `#020617` |
| `surface` | panels, cards, inputs | white | `#0f172a` |
| `surface-muted` | headers, chips, table stripes inside a surface | slate-100 | `#1e293b` |
| `surface-raised` | menus, popovers, dialogs | white | `#1e293b` |
| `surface-subtle` | sunken areas and hover inside a surface (was slate-50) | slate-50 | `#162032` |
| `surface-strong` | tracks, pressed chips (was slate-200); **no `fg-subtle` on it** | slate-200 | `#334155` |
| `border` / `border-strong` | dividers / input and card borders | slate-200 / slate-300 | `#334155` / `#475569` |
| `fg-strong` | headings, emphasised values (was slate-900) | slate-900 | `#f8fafc` |
| `fg` | body text | slate-800 | `#e2e8f0` |
| `fg-muted` | secondary text, labels | slate-600 | `#cbd5e1` |
| `fg-subtle` | hints, placeholders; **not on `surface-muted`** | slate-500 | `#94a3b8` |
| `focus` | focus outlines | sky-600 | `#38bdf8` |
| `accent` / `accent-hover` / `accent-fg` | primary button fill / hover / its text | sky-700 / sky-800 / white | same |
| `accent-muted` | selected row, info box background | sky-50 | `#082f49` |
| `accent-text` | links, accent icons and text on surfaces | sky-700 | `#7dd3fc` |
| `danger`, `warning`, `success` | status text and icons on surfaces | rose-700, amber-700, emerald-700 | rose-300, amber-300, emerald-300 |
| `danger-muted`, `warning-muted`, `success-muted` | status box backgrounds (pair with the text token) | 50 shades | 950 shades |
| `canvas`, `canvas-grid` | map background, grid dots | slate-50, slate-300 | `#0f172a`, `#334155` |
| `node`, `node-border` | device node box | white, slate-300 | `#1e293b`, `#64748b` |
| `cable`, `cable-unplugged` | plugged cable, unplugged (dashed) cable | `#64748b`, `#cbd5e1` | `#94a3b8`, `#475569` |
| `link-up`, `link-down` | link-light LEDs | `#22c55e`, `#94a3b8` | `#4ade80`, `#64748b` |
| `port-label`, `port-label-halo` | port text on the map and its outline | `#475569`, `#f8fafc` | `#cbd5e1`, `#0f172a` |
| `packet-<protocol>` | envelope fill per protocol (arp, icmp, dhcp, dns, http, tcp, udp, ipv4, ethernet, hdlc) | today's `PROTOCOL_STYLES.fill` | 400 shades |
| `packet-dropped`, `packet-highlight` | dropped packet, highlighted device | `#dc2626`, `#f59e0b` | `#f87171`, `#fbbf24` |

Printing: the `dark` variant and the dark token blocks sit inside `@media not print`, so printed pages (the
handover pack) always use the light values, whatever the theme. Hues without a token (status boxes, chips,
badges) use `dark:` partners: `bg-<hue>-50` → `dark:bg-<hue>-950/40`, `bg-<hue>-100` → `dark:bg-<hue>-900/40`,
text 600–950 → `dark:text-<hue>-200/300`, borders and rings 100–300 → 900–700
(checked by `src/features/shared/darkPaletteContrast.test.ts`). React Flow's minimap, controls and selection
box read the tokens through its `--xy-*` variables (index.css).

When to use what:

- **Tokens first** for anything that has a role in the list above (backgrounds, text, borders, map,
  packets). One class works in light, dark and high contrast: `bg-surface text-fg border-border`.
- **`dark:` utilities** only for one-off tweaks without a role (an illustration, a gradient, a shadow
  strength), e.g. `shadow-md dark:shadow-none`. Never re-create a token with `bg-white dark:bg-slate-900`.
- Status chips per protocol (`PROTOCOL_STYLES.chip`) and the terminal (already dark, Windows-console
  colours) keep their own colours; give chips `dark:` variants when they are converted.
- New tokens go into all three places (light `@theme static`, `.dark`, and the high-contrast blocks when
  they are text or borders) and into `designTokens.test.ts` pairs.

Contrast (checked by `src/preferences/designTokens.test.ts`): every text pair in the table meets WCAG
AA 4.5:1 in light, dark, high contrast and dark high contrast; in dark mode the map graphics (cables,
LEDs, node borders, packets, focus) meet 3:1 against the canvas. Known light-mode gaps kept on purpose
(today's look): `link-up` LED (2.2:1, has a white ring), `cable-unplugged` (deliberately faint, also
dashed), `packet-arp` and `packet-highlight` (≈3.0 and 2.1:1).

## 6. Preferences screen and dialog (`src/features/preferences`, PU)

- **Route** `/preferences` (`AppRouteCodec`, `routes.preferences`, always rendered by `RouteResolver`): `PreferencesScreen`,
  linked from the gear in `SiteHeader` (landing, lists, results).
- **Dialog** in every workspace screen (lab, exercise, design, sample): the gear in `WorkspaceHeader` and File →
  Preferences open `PreferencesDialog` (lazy, through `PreferencesDialogHost` + the `preferencesDialog` state), so the
  open lab and its undo history stay. Full screen on phones; Tab is kept inside, Escape closes, keys do not reach the
  workspace shortcuts, the opener gets the focus back.
- **Tabs** (`PreferencesView`, `model/preferenceTabs.ts`): Appearance, Map, Animation & simulation, Terminal / CLI,
  Cables, Language, Data. WAI-ARIA tabs with roving tabindex (selection follows focus); a vertical column from 768 px
  (Up / Down), a scrollable row on phones (Left / Right, reversed in RTL), Home / End. Every change is saved at once.
- **Language** uses `useLanguage().changeLanguage` (not stored here).
- **Data**: autosave switch; export (`agArizaLabPreferences.json`) / import (`store.importJson`, reports `ignored`) /
  reset of the preferences; reset progress per kind (exercises `agArizaLab.progress.v1`, designs
  `agArizaLab.designProgress.v1`, samples `agArizaLab.samples.progress`), then the page reloads; clear local data
  (every `agArizaLab.*` localStorage key + the labs' IndexedDB store `LAB_DATABASE`), then the home page opens.
  Both ask in place first (`ConfirmAction`: Cancel takes the focus, Escape cancels). Logic: `model/LocalDataEraser.ts`.
  Known edge: a lab edit made less than 800 ms before "clear" may be written again by the autosaver's `pagehide` flush.
- **Wiring helpers** (pure, tested): `model/preferenceWiring.ts`.

**Shown disabled ("coming soon")**: Cables → cable length effects (no field yet; arrives with the physical view,
BACKLOG 3/15). Every stored field above has a consumer; the only partial one is `terminal.historyLength` above 10
for device CLIs (see the table).
