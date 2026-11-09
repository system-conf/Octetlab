import type { DeviceKind } from '../../../domain'
import type { DeviceStyle } from '../../../preferences'
import { deviceIconForModel } from '../deviceIconRegistry'
import { DeviceIconGlyph } from '../DeviceKindIcon'
import { DeviceIllustration } from './DeviceIllustration'
import { useDeviceStyle } from './useDeviceStyle'

interface DeviceVisualProps {
  kind: DeviceKind
  /** Catalog model id (Device.modelId): modems, rack server, smart TV… have their own picture. */
  modelId?: string
  /** Classes of the line icon ('simple' style). */
  className?: string
  /** Classes of the picture (illustrated styles; usually a bit larger than the icon). */
  illustrationClassName?: string
  /** Line icon colour ('simple' only): category colours, or the surrounding text colour. */
  tone?: 'category' | 'inherit'
  /** Style to draw in; default: the user's preference. */
  deviceStyle?: DeviceStyle
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}

/**
 * A device's icon in the user's device style: today's line icon for 'simple', the frameless picture
 * of the same device (model → kind → fallback) otherwise.
 */
export function DeviceVisual({ kind, modelId, className, illustrationClassName, tone, deviceStyle, ...aria }: DeviceVisualProps) {
  const preferred = useDeviceStyle()
  const style = deviceStyle ?? preferred
  const icon = deviceIconForModel(kind, modelId)
  if (style === 'simple') return <DeviceIconGlyph icon={icon} tone={tone} className={className} {...aria} />
  return <DeviceIllustration icon={icon} style={style} className={illustrationClassName ?? className} {...aria} />
}
