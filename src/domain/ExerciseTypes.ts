// v2 exercise contract (MODEL_V2 §10): an exercise is a locked lab plus solve conditions.
// Data only; every text lives in the `exercises` namespace keyed by the exercise id (docs/I18N.md §5).
// Design briefs (second half of the file) keep their texts in the `design` namespace.
import type { DeviceKind } from './DeviceTypes'
import type { DeviceCapability, DeviceCategory } from './DeviceModel'
import type { Annotation, LabLayout } from './LabDocument'
import type { NetworkState } from './NetworkState'

/** Business setting of the story (card icon, `landing:settings.<setting>`). */
export type ExerciseSetting = 'restaurant' | 'office' | 'shop'

export type SolveCondition =
  /** fromDeviceId can ping an internet address (8.8.8.8). */
  | { type: 'internet'; fromDeviceId: string }
  /** fromDeviceId can resolve `name` through its DNS settings. */
  | { type: 'resolves'; fromDeviceId: string; name: string }
  /** fromDeviceId can reach the current address of toDeviceId. */
  | { type: 'reachable'; fromDeviceId: string; toDeviceId: string }
  /**
   * Pack 5.2: fromDeviceId can NOT reach the current address of toDeviceId (an ACL blocks it). Holds only
   * when the target has an address, so an unconfigured target never counts as "blocked".
   */
  | { type: 'unreachable'; fromDeviceId: string; toDeviceId: string }
  /** Every AppLink on deviceId reports ok. */
  | { type: 'appLinksOk'; deviceId: string }

/** Settings areas of a device that can be locked as a whole. 'terminal' is the command prompt / CLI. */
export type DeviceSection =
  | 'power'
  | 'ports'
  | 'host'
  | 'switching'
  | 'routing'
  | 'wireless'
  | 'services'
  | 'internet'
  | 'terminal'
  /** Pack 5.2: access lists, NAT, local users, SSH and the domain name (features.accessLists / nat / management users, ssh, domainName). */
  | 'security'

/** readOnly = shown but not editable; hidden = not shown at all (the learner must find it another way). */
export type LockAccess = 'readOnly' | 'hidden'

/** Restrictions of an exercise lab. Anything not locked is editable. */
export type ExerciseLock =
  /** No devices or links may be added, deleted or moved. */
  | { scope: 'topology' }
  /** The link may not be deleted or unplugged. */
  | { scope: 'link'; linkId: string }
  /** Every setting of the device. */
  | { scope: 'device'; deviceId: string; access: LockAccess }
  | { scope: 'section'; deviceId: string; section: DeviceSection; access: LockAccess }
  /** One port (its l2 / l3 settings, adminUp, sub-interfaces). */
  | { scope: 'port'; deviceId: string; portId: string; access: LockAccess }
  /**
   * The device may not be deleted; moving, cabling and configuring it stay allowed. Design briefs
   * pin the customer's devices with it (the topology itself stays open). Enforced by
   * ExerciseLockPolicy.allowedDeletion (DESIGN_EXERCISES.md §6.6).
   */
  | { scope: 'placement'; deviceId: string }

/** Network and canvas of an exercise; opening the exercise turns it into a LabDocument. */
export interface ExerciseLab {
  state: NetworkState
  layout: LabLayout
}

/**
 * Data-only exercise. Device names and AppLink labels in `lab.state` are placeholders (their ids),
 * localized from `exercises:<id>.devices.<deviceId>` / `.appLinks.<appLinkId>`. Title, complaint,
 * guide steps (`hints.0..2`), explanation and topics are `exercises:<id>.*` keys.
 */
export interface ExerciseDefinition {
  /** camelCase; also the key of the exercise in the `exercises` namespace. */
  id: string
  order: number
  setting: ExerciseSetting
  lab: ExerciseLab
  /** All must hold for the exercise to count as solved. */
  solvedWhen: SolveCondition[]
  locks: ExerciseLock[]
}

/** Texts of one exercise in the active language, read from `exercises:<id>.*`. */
export interface ExerciseTexts {
  title: string
  complaint: { from: string; message: string }
  /** Three guide steps: direction → location → answer (`hints.0..2`). */
  guide: [string, string, string]
  explanation: { whatHappened: string; realLife: string; interviewAnswer: string }
  topics: string[]
}

/** LOCALIZED exercise the UI consumes: the definition with device names / labels filled in, plus texts. */
export interface Exercise extends ExerciseDefinition {
  texts: ExerciseTexts
}

// ---------------------------------------------------------------------------------------------
// Design exercises (docs/DESIGN_EXERCISES.md): a customer brief, a starting lab with the customer's
// devices, and requirements the learner's design must meet. Data only; texts live in the `design`
// namespace under `design:briefs.<id>.*`. Evaluated by src/design (RequirementChecker, DesignReview).
// ---------------------------------------------------------------------------------------------

/** Business setting of a design brief (card icon, `design:settings.<setting>`). */
export type DesignSetting = ExerciseSetting | 'school' | 'factory' | 'hotel'

/**
 * A named set of the brief's customer devices ("office PCs", "cameras", "guests"). Members are device
 * ids of the starting lab. `name` is a placeholder (= id) in the definition, localized from
 * `design:briefs.<briefId>.groups.<groupId>`.
 */
export interface DeviceGroup {
  /** camelCase, unique in the brief. */
  id: string
  name: string
  deviceIds: string[]
}

/**
 * What fails in a `survivesFailure` requirement. The learner adds the infrastructure, so ids of
 * learner devices are unknown when the brief is written: `anyDevice` / `anyLink` try every single
 * failure. Devices / links directly linked to a member of the inner requirement's groups are skipped
 * there (a single-homed PC always depends on its own access switch and patch cable).
 */
export type FailureTarget =
  /** A device of the starting lab (e.g. the ISP cloud = internet outage) is powered off. */
  | { scope: 'device'; deviceId: string }
  /** A link of the starting lab is unplugged. */
  | { scope: 'link'; linkId: string }
  /** Each single device of these kinds, one at a time (members and their direct neighbours excepted). */
  | { scope: 'anyDevice'; kinds: DeviceKind[] }
  /** Each single link, one at a time (links ending on a member excepted). */
  | { scope: 'anyLink' }

/**
 * Requirements about the working network. Groups are `DeviceGroup.id`s; "every member" means every
 * device of the group. Evaluated on a copy of the lab in which every DHCP client has requested an
 * address (the designed network, not the momentary lease state).
 */
export type NetworkCondition =
  /** Every member of `fromGroup` reaches (ping) the first address of every member of `toGroup`. */
  | { type: 'reachable'; fromGroup: string; toGroup: string }
  /**
   * No member of `fromGroup` reaches any member of `toGroup`, and every member of both groups is in
   * service (has an address and reaches its default gateway or another member of its group).
   */
  | { type: 'notReachable'; fromGroup: string; toGroup: string }
  /** Every member reaches the internet (8.8.8.8). */
  | { type: 'internet'; group: string }
  /** Every member resolves `name` through its DNS settings. */
  | { type: 'resolves'; group: string; name: string }
  /** Every member has a NIC in DHCP mode and obtains an address from a DHCP server. */
  | { type: 'dhcpServes'; group: string }
  /** Every member of both groups has an address and no subnet of `groupA` is a subnet of `groupB`. */
  | { type: 'separateSubnets'; groupA: string; groupB: string }
  /** All members share one layer-2 broadcast domain (same VLAN, connected). */
  | { type: 'sameVlan'; group: string }
  /** Every member's address lies inside `prefix` (CIDR, e.g. '192.168.10.0/24'). */
  | { type: 'addressPlan'; group: string; prefix: string }

/** Limits on the design itself. They hold for an empty design; see DesignReview scoring. */
export type LimitCondition =
  /** Price of every device and cable the learner added is at most `amount` (price units). */
  | { type: 'maxCost'; amount: number }
  /** At most `count` added devices of `kind` (absent = added devices of any kind). */
  | { type: 'maxDevices'; kind?: DeviceKind; count: number }

/** Every requirement type of DESIGN_EXERCISES.md §2. */
export type DesignCondition =
  | NetworkCondition
  /** `requirement` still holds while `failure` is down (and holds with everything up). */
  | { type: 'survivesFailure'; failure: FailureTarget; requirement: NetworkCondition }
  /** A powered device whose catalog model has `capability` is in the lab with at least one link up. */
  | { type: 'uses'; capability: DeviceCapability }
  | LimitCondition

export interface DesignRequirement {
  /** camelCase, unique in the brief; review hints and texts refer to it. */
  id: string
  condition: DesignCondition
  /** Not shown in the live checklist; graded and shown in the review ("acceptance test"). */
  hidden?: boolean
  /** Share of the score; absent = 1. */
  weight?: number
}

/** Which catalog models the palette offers in this brief. Absent = the whole catalog. */
export interface CatalogFilter {
  /** Models of these categories are allowed. */
  categories?: DeviceCategory[]
  /** These models are allowed (in addition to `categories`). */
  modelIds?: string[]
}

/** A hint of the review report: `design:briefs.<briefId>.reviewHints.<id>`. */
export interface ReviewHint {
  id: string
  /** Shown only when this requirement failed; absent = always shown. */
  requirementId?: string
}

/** Network, canvas and zone annotations (labels localized from `design:briefs.<id>.zones.<annotationId>`). */
export interface DesignLab extends ExerciseLab {
  annotations: Annotation[]
}

/**
 * Data-only design brief. Device names in the labs and group names are placeholders (their ids),
 * localized from `design:briefs.<id>.devices.<deviceId>` / `.groups.<groupId>`.
 */
export interface DesignExerciseDefinition {
  /** camelCase; also the key of the brief in `design:briefs`. */
  id: string
  order: number
  setting: DesignSetting
  /** The customer's devices, placed; the learner adds the infrastructure. */
  lab: DesignLab
  /** Locks of the starting lab (the topology is never locked: the learner builds it). */
  locks: ExerciseLock[]
  groups: DeviceGroup[]
  requirements: DesignRequirement[]
  /** Budget for the budget meter (price units); a `maxCost` requirement grades it. */
  budget?: number
  allowedModels?: CatalogFilter
  /** A design that meets every requirement; contains every device of `lab` with the same ids. */
  reference: DesignLab
  reviewHints: ReviewHint[]
}

/** Texts of one brief in the active language, read from `design:briefs.<id>.*`. */
export interface DesignBriefTexts {
  title: string
  /** The brief in the customer's words. */
  customer: { from: string; message: string }
  /** Reference design: why it looks like this, how to present it to the customer / in an interview. */
  reference: { explanation: string; presentation: string; interviewAnswer: string }
  topics: string[]
}

/** LOCALIZED brief the UI consumes: names filled in (devices, groups, zones), plus texts. */
export interface DesignExercise extends DesignExerciseDefinition {
  texts: DesignBriefTexts
}
