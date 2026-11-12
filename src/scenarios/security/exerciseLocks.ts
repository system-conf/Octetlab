import type { ExerciseLock } from '../../domain'

/** The given network is fixed (topology) and only the devices not listed here may be configured. */
export function onlyEditable(allDeviceIds: readonly string[], editable: readonly string[]): ExerciseLock[] {
  const locked = allDeviceIds.filter((deviceId) => !editable.includes(deviceId))
  return [{ scope: 'topology' }, ...locked.map((deviceId): ExerciseLock => ({ scope: 'device', deviceId, access: 'readOnly' }))]
}
