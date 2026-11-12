// Light metadata of the pack 5.2 exercises (ACL, NAT) for the exercise list in the main chunk: the
// labs themselves are built in the lazy exercise chunk (securityExercises). Texts: `exercises:<id>.*`.
import type { ExerciseSetting } from '../../domain'

export interface SecurityExerciseMeta {
  id: string
  order: number
  setting: ExerciseSetting
}

export const CAFE_GUEST_WIFI: SecurityExerciseMeta = { id: 'cafeGuestWifi', order: 6, setting: 'restaurant' }
export const OFFICE_SHARED_IP: SecurityExerciseMeta = { id: 'officeSharedIp', order: 7, setting: 'office' }

/** In order. */
export const SECURITY_EXERCISE_INDEX: readonly SecurityExerciseMeta[] = [CAFE_GUEST_WIFI, OFFICE_SHARED_IP]
