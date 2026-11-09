import { DeviceIconGlyph, DeviceIllustration, type DeviceIconId } from '../../../catalog'
import type { DeviceStyle } from '../../../preferences'

/** Devices shown in each option of the device-style choice. */
const PREVIEW_ICONS: readonly DeviceIconId[] = ['router', 'switch', 'pc']

/** Router, switch and PC drawn in one device style, as they look on the map (decorative). */
function DeviceStylePreview({ deviceStyle }: { deviceStyle: DeviceStyle }) {
  return (
    <span className="flex items-center gap-1 py-1" data-device-style-preview={deviceStyle}>
      {PREVIEW_ICONS.map((icon) =>
        deviceStyle === 'simple' ? (
          <span key={icon} className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-node-border bg-node text-fg">
            <DeviceIconGlyph icon={icon} className="h-5 w-5" />
          </span>
        ) : (
          <DeviceIllustration key={icon} icon={icon} style={deviceStyle} className="h-10 w-10" />
        ),
      )}
    </span>
  )
}

export default DeviceStylePreview
