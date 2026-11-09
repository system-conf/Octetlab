import { usePreference, type DeviceStyle } from '../../../preferences'

/** The device style the user chose (Preferences → Map → device style). */
export function useDeviceStyle(): DeviceStyle {
  return usePreference('map.deviceStyle')[0]
}
