# Device styles (Preferences → Map → "Cihaz görünümü" / "Device style")

Three looks for devices on the map, chosen by the user:

| Value | Look | Source |
| --- | --- | --- |
| `simple` (default, today's look) | framed 48 × 48 box with the line icon | `DeviceKindIcon` (unchanged) |
| `classic` | frameless network-diagram pictures: blue cylinder router with arrows, blue box switch with arrows, beige PC, cloud… (the familiar style of classic network diagrams and lab tools) | `src/catalog/icons/illustrated/classic/` |
| `realistic` | frameless pictures of real hardware: ports, LEDs, screens, white ceiling AP, rack units | `src/catalog/icons/illustrated/realistic/` |

All art is our own drawing (MIT); never copy icons from Cisco Packet Tracer or other products.
The style started from an approved 8-device mock-up per style (router, switch, access point, PC,
laptop, server, printer, internet); those drawings now live in the art files. New pictures must
match the existing ones of their style.

## Contract (written by the coordinator)
- `illustrated/illustratedTypes.ts`: `IllustratedIconStyle = 'classic' | 'realistic'`,
  `IllustrationSet = Record<DeviceIconId, ReactNode>` — SVG content for a **64 × 64** viewBox.
- `classic/classicArt.tsx` exports `CLASSIC_ART`, `classic/ClassicIconDefs.tsx` exports
  `ClassicIconDefs()` (returns `<defs>…</defs>` content: gradients with ids `octetClassic…`).
- `realistic/realisticArt.tsx` exports `REALISTIC_ART`, `realistic/RealisticIconDefs.tsx` exports
  `RealisticIconDefs()` (ids `octetRealistic…`).
- Art may be split into several files per style (network / end devices / WAN), each < 500 lines;
  `classicArt.tsx` / `realisticArt.tsx` assemble the set.
- Pictures carry their own colours (they look the same in light and dark themes) and must read well
  on both the light canvas (#f8fafc) and the dark canvas (#0f172a): give light shapes a darker
  outline. Device fills the box: roughly 4–60 in x; leave the bottom ≤ 60.
- Each picture must be recognisable at 40 px and distinct from the others of its set (router vs
  server, switch vs hub vs l3Switch vs NVR, pc vs pos vs kitchenDisplay vs smartTv, modems vs
  wirelessRouter).

## Agents
- **C** (owns `illustrated/classic/**`): the 25 classic pictures + defs.
- **G** (owns `illustrated/realistic/**`): the 25 realistic pictures + defs.
- **W** (wiring; owns everything else it needs): preference `map.deviceStyle`
  (`'simple' | 'classic' | 'realistic'`, default `'simple'`) through the preferences model, codec
  tests, docs/PREFERENCES.md row, tr/en locale text; `illustrated/IllustratedIconDefs.tsx` (one hidden
  `<svg>` with both defs, mounted once at the app root — not `display:none`, gradients must resolve),
  `illustrated/DeviceIllustration.tsx` (`{ icon, style, className, size }` → `<svg viewBox="0 0 64 64">`);
  use them in `WorkspaceDeviceNode` (frameless picture, same centre/handles so cables still meet the
  centre; selected = soft sky ring/glow under the picture; powered off = greyscale + faded; keep the
  power dot and cable-tool highlight states), palette tiles (`ModelTileGrid`, `ModelDetailCard`) and
  `DeviceInfoPanel` header. `HandoverTopology` (printed pack) stays `simple`. The Map tab shows the
  choice with a small preview (router, switch, PC) per option.
