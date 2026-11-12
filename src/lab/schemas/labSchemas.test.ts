// Compile-time proof that the zod schemas mirror src/domain exactly: `tsc -b` (npm run build)
// fails when a domain type and its schema drift apart. The runtime tests check the reserved keys.
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import type {
  AccessListSettings,
  LocalUser,
  NatSettings,
  SshSettings,
  Annotation,
  Device,
  DeviceKind,
  DeviceServices,
  HostSettings,
  InternetSettings,
  L3Settings,
  LabDocument,
  LabLayout,
  LabMeta,
  Link,
  NetworkState,
  Port,
  RoutingSettings,
  StaticRoute,
  SwitchingSettings,
  SwitchportSettings,
  WirelessSettings,
} from '../../domain'
import type { V1NetworkState, V1ScenarioDefinition } from '../migrations/v1Types'
import {
  deviceKindSchema,
  deviceSchema,
  hostSettingsSchema,
  routingSettingsSchema,
  staticRouteSchema,
  switchingSettingsSchema,
  wirelessSettingsSchema,
} from './deviceSchemas'
import {
  annotationSchema,
  labDocumentSchema,
  labLayoutSchema,
  labMetaSchema,
  linkSchema,
  networkStateSchema,
} from './labDocumentSchema'
import { l3SettingsSchema, portSchema, switchportSettingsSchema } from './portSchemas'
import { accessListSettingsSchema, localUserSchema, natSettingsSchema, sshSettingsSchema } from './securitySchemas'
import { deviceServicesSchema, internetSettingsSchema } from './serviceSchemas'
import { v1NetworkStateSchema, v1ScenarioDefinitionSchema } from './v1Schemas'

/** Flattens intersections and distributes over unions so equal shapes compare equal. */
type Normalize<T> = T extends object ? { [Key in keyof T]: Normalize<T[Key]> } : T

/** Strict type identity (optional modifiers, literal types and union members all count). */
type Equals<A, B> =
  (<T>() => T extends Normalize<A> ? 1 : 2) extends <T>() => T extends Normalize<B> ? 1 : 2 ? true : false

type Mirrors<Schema extends z.ZodType, Domain> = Equals<z.infer<Schema>, Domain>

function assertTrue<T extends true>(proof: T): T {
  return proof
}

const proofs = [
  assertTrue<Mirrors<typeof labDocumentSchema, LabDocument>>(true),
  assertTrue<Mirrors<typeof labMetaSchema, LabMeta>>(true),
  assertTrue<Mirrors<typeof labLayoutSchema, LabLayout>>(true),
  assertTrue<Mirrors<typeof annotationSchema, Annotation>>(true),
  assertTrue<Mirrors<typeof networkStateSchema, NetworkState>>(true),
  assertTrue<Mirrors<typeof linkSchema, Link>>(true),
  assertTrue<Mirrors<typeof deviceSchema, Device>>(true),
  assertTrue<Mirrors<typeof deviceKindSchema, DeviceKind>>(true),
  assertTrue<Mirrors<typeof portSchema, Port>>(true),
  assertTrue<Mirrors<typeof l3SettingsSchema, L3Settings>>(true),
  assertTrue<Mirrors<typeof switchportSettingsSchema, SwitchportSettings>>(true),
  assertTrue<Mirrors<typeof hostSettingsSchema, HostSettings>>(true),
  assertTrue<Mirrors<typeof switchingSettingsSchema, SwitchingSettings>>(true),
  assertTrue<Mirrors<typeof routingSettingsSchema, RoutingSettings>>(true),
  assertTrue<Mirrors<typeof staticRouteSchema, StaticRoute>>(true),
  assertTrue<Mirrors<typeof wirelessSettingsSchema, WirelessSettings>>(true),
  assertTrue<Mirrors<typeof deviceServicesSchema, DeviceServices>>(true),
  assertTrue<Mirrors<typeof internetSettingsSchema, InternetSettings>>(true),
  assertTrue<Mirrors<typeof accessListSettingsSchema, AccessListSettings>>(true),
  assertTrue<Mirrors<typeof natSettingsSchema, NatSettings>>(true),
  assertTrue<Mirrors<typeof localUserSchema, LocalUser>>(true),
  assertTrue<Mirrors<typeof sshSettingsSchema, SshSettings>>(true),
  assertTrue<Mirrors<typeof v1NetworkStateSchema, V1NetworkState>>(true),
  assertTrue<Mirrors<typeof v1ScenarioDefinitionSchema, V1ScenarioDefinition>>(true),
]

// Negative control: the check really distinguishes shapes.
const notEqual: Equals<{ a: string; b?: number }, { a: string }> = false

describe('lab schemas', () => {
  it('mirror the domain types (checked by tsc)', () => {
    expect(proofs.every(Boolean)).toBe(true)
    expect(notEqual).toBe(false)
  })

  it('refuse values on reserved extension keys', () => {
    const l3 = { ipv4: { addressing: 'static', address: '10.0.0.1', mask: '255.0.0.0' } }
    expect(l3SettingsSchema.safeParse(l3).success).toBe(true)
    expect(l3SettingsSchema.safeParse({ ...l3, ipv6: {} }).success).toBe(false)
    expect(l3SettingsSchema.safeParse({ ...l3, features: { ospf: { area: 0 } } }).success).toBe(false)
    expect(deviceServicesSchema.safeParse({ http: true }).success).toBe(false)
  })

  it('refuse unknown keys instead of dropping them', () => {
    expect(labMetaSchema.safeParse({ title: 't', createdAt: '', updatedAt: '', colour: 'red' }).success).toBe(false)
  })

  it('accept both static-route forms and refuse a route without target', () => {
    const base = { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1 }
    expect(staticRouteSchema.safeParse({ ...base, nextHop: '10.0.0.1' }).success).toBe(true)
    expect(staticRouteSchema.safeParse({ ...base, exitInterfaceId: 'Gi0/1' }).success).toBe(true)
    expect(staticRouteSchema.safeParse(base).success).toBe(false)
  })
})
