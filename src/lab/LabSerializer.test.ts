import { describe, expect, it } from 'vitest'
import { LAB_SCHEMA_VERSION, type LabDocument } from '../domain'
import { scenarioDefinitions } from '../scenarios/scenarioDefinitions'
import { createEmptyLab, createLabFromExercise } from './createLab'
import { MAX_REPORTED_ERRORS } from './LabMessages'
import { LabMigrationChain, type LabMigrationStep } from './LabMigrationChain'
import { LabSerializer, type LabParseResult } from './LabSerializer'
import { migrateV1Exercise } from './migrations'
import { expectLabMessage, FIXED_NOW, sampleLab } from './testLabs'

const serializer = new LabSerializer(new LabMigrationChain(undefined, () => FIXED_NOW))

function okDoc(result: LabParseResult): LabDocument {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`)
  return result.doc
}

function errorsOf(result: LabParseResult) {
  if (result.ok) throw new Error('expected errors')
  for (const error of result.errors) expectLabMessage(error)
  return result.errors
}

/** JSON copy of the sample with one change applied to the plain data. */
function mutated(change: (raw: Record<string, unknown> & { state: { devices: Record<string, unknown>[] } }) => void): string {
  const raw = JSON.parse(serializer.serialize(sampleLab()))
  change(raw)
  return JSON.stringify(raw)
}

describe('LabSerializer round trip', () => {
  it('reads back what it writes, from text and from objects', () => {
    const doc = sampleLab()
    const text = serializer.serialize(doc)
    expect(okDoc(serializer.parse(text))).toEqual(doc)
    expect(okDoc(serializer.parse(JSON.parse(text)))).toEqual(doc)
    expect(serializer.parse(text)).toMatchObject({ origin: null })
  })

  it('writes stable, pretty JSON independent of key insertion order', () => {
    const doc = sampleLab()
    const reordered: LabDocument = {
      annotations: doc.annotations,
      notes: doc.notes,
      layout: doc.layout,
      state: doc.state,
      meta: { updatedAt: doc.meta.updatedAt, createdAt: doc.meta.createdAt, title: doc.meta.title },
      schemaVersion: doc.schemaVersion,
    }
    const text = serializer.serialize(doc)
    expect(serializer.serialize(reordered)).toBe(text)
    expect(text.startsWith('{\n  "schemaVersion": 2,\n  "meta": {')).toBe(true)
    expect(text.endsWith('}\n')).toBe(true)
    expect(serializer.serializeCompact(doc)).toBe(JSON.stringify(JSON.parse(text)))
  })

  it('keeps an empty lab valid', () => {
    const empty = createEmptyLab('', FIXED_NOW)
    expect(empty.meta).toEqual({ title: '', createdAt: FIXED_NOW.toISOString(), updatedAt: FIXED_NOW.toISOString() })
    expect(okDoc(serializer.parse(serializer.serialize(empty)))).toEqual(empty)
  })
})

describe('LabSerializer refusals', () => {
  it('reports text that is not JSON', () => {
    expectLabMessage(errorsOf(serializer.parse('{ nope'))[0], 'lab:import.notJson')
  })

  it('reports JSON that is not a lab', () => {
    for (const input of ['[]', '42', 'null', '{"hello":1}']) {
      expectLabMessage(errorsOf(serializer.parse(input))[0], 'lab:import.notALab')
    }
  })

  it('refuses newer and invalid format versions clearly', () => {
    const newer = errorsOf(serializer.parse(mutated((raw) => (raw.schemaVersion = LAB_SCHEMA_VERSION + 1))))
    expectLabMessage(newer[0], 'lab:import.unsupportedVersion')
    expect(newer[0]?.params).toEqual({ version: 3, supported: 2 })
    expectLabMessage(errorsOf(serializer.parse('{"schemaVersion":"two"}'))[0], 'lab:import.invalidVersion')
    expectLabMessage(errorsOf(serializer.parse('{"schemaVersion":1}'))[0], 'lab:import.invalidVersion')
  })

  it('names the bad field with device and port ids in the path', () => {
    const errors = errorsOf(
      serializer.parse(
        mutated((raw) => {
          const pc = raw.state.devices[0] as { ports: Record<string, unknown>[] }
          if (pc.ports[0]) pc.ports[0].medium = 'laser'
        }),
      ),
    )
    expectLabMessage(errors[0], 'lab:schema.invalidValue')
    expect(errors[0]?.params?.path).toBe('state.devices[pc].ports[eth0].medium')
  })

  it('refuses unknown keys, reserved extension keys and wrong types', () => {
    const unknown = errorsOf(serializer.parse(mutated((raw) => ((raw.meta as Record<string, unknown>).colour = 'red'))))
    expectLabMessage(unknown[0], 'lab:schema.unknownKey')
    expect(unknown[0]?.params).toEqual({ path: 'meta', key: 'colour' })
    const reserved = errorsOf(serializer.parse(mutated((raw) => (raw.state.devices[0] = { ...raw.state.devices[0], features: { discovery: {} } }))))
    expectLabMessage(reserved[0], 'lab:schema.unknownKey')
    expect(reserved[0]?.params).toEqual({ path: 'state.devices[pc].features.discovery', key: 'discovery' })
    const wrongType = errorsOf(serializer.parse(mutated((raw) => (raw.notes = 5))))
    expectLabMessage(wrongType[0], 'lab:schema.invalidType')
    expect(wrongType[0]?.params).toEqual({ path: 'notes', expected: 'string' })
  })

  it('explains a broken union by its closest branch', () => {
    const errors = errorsOf(
      serializer.parse(
        mutated((raw) => {
          const sw = raw.state.devices[2] as { ports: { l2: Record<string, unknown> }[] }
          if (sw.ports[0]) sw.ports[0].l2.allowedVlans = [1, 2.5]
        }),
      ),
    )
    expectLabMessage(errors[0], 'lab:schema.notInteger')
    expect(errors[0]?.params?.path).toBe('state.devices[sw].ports[Fa0/1].l2.allowedVlans[1]')
  })

  it('reports state invariants after the schema passed', () => {
    const doc = sampleLab()
    const [pc, laptop] = doc.state.devices
    if (!pc || !laptop) throw new Error('fixture')
    const clash = { ...laptop, ports: laptop.ports.map((port) => ({ ...port, mac: pc.ports[0]?.mac })) }
    const broken = { ...doc, state: { ...doc.state, devices: [pc, clash, ...doc.state.devices.slice(2)] } }
    const errors = errorsOf(serializer.parse(serializer.serialize(broken)))
    expectLabMessage(errors[0], 'lab:invariant.duplicateMac')
    expect(errors[0]?.params).toEqual({ deviceId: 'laptop', portId: 'wlan0' })

    const sharedPort = { ...doc, state: { ...doc.state, links: [...doc.state.links, { ...doc.state.links[0], id: 'link9' }] } }
    const linkErrors = errorsOf(serializer.parse(JSON.stringify(sharedPort)))
    expect(linkErrors.map((error) => error.key)).toContain('lab:invariant.invalidLink.portInUse')
  })

  it('caps long error lists with a summary line', () => {
    const errors = errorsOf(
      serializer.parse(
        mutated((raw) => {
          for (const device of raw.state.devices) device.powered = 'yes'
          raw.notes = 1
          raw.annotations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        }),
      ),
    )
    expect(errors).toHaveLength(MAX_REPORTED_ERRORS + 1)
    expectLabMessage(errors.at(-1), 'lab:import.moreErrors')
  })
})

describe('LabSerializer migrations', () => {
  it('opens every v1 exercise file as a lab', () => {
    for (const definition of scenarioDefinitions) {
      const result = serializer.parse(JSON.stringify(definition))
      const doc = okDoc(result)
      expect(result).toMatchObject({ origin: 'v1' })
      expect(doc.meta.title).toBe(definition.id)
      expect(doc.state.devices.map((device) => device.id)).toEqual(definition.initialState.devices.map((device) => device.id))
      expect(doc).toEqual(createLabFromExercise(migrateV1Exercise(definition), { title: definition.id, now: FIXED_NOW }))
    }
  })

  it('opens a v1 network with its map positions', () => {
    const [first] = scenarioDefinitions
    if (!first) throw new Error('fixture')
    const doc = okDoc(serializer.parse(JSON.stringify(first.initialState)))
    const device = first.initialState.devices[0]
    if (!device) throw new Error('fixture')
    expect(doc.layout.devices[device.id]).toEqual(device.position)
    expect(doc.meta.title).toBe('')
  })

  it('reports v1 data the migration cannot place', () => {
    const [first] = scenarioDefinitions
    if (!first) throw new Error('fixture')
    const state = first.initialState
    const badLink = { id: 'ghost', a: { deviceId: 'nowhere', portId: 'eth0' }, b: state.links[0]?.b, connected: true }
    const errors = errorsOf(serializer.parse({ ...state, links: [...state.links, badLink] }))
    expectLabMessage(errors[0], 'lab:import.migrationFailed')
    expect(errors[0]?.params?.version).toBe(1)
    const badMac = errorsOf(serializer.parse({ ...state, devices: state.devices.map((device) => ({ ...device, mac: 'x' })) }))
    expectLabMessage(badMac[0], 'lab:schema.invalid')
  })

  it('chains format steps up to the current version', () => {
    const step: LabMigrationStep = {
      from: 1,
      migrate: ({ notebook, ...raw }) => ({ ...raw, schemaVersion: 2, notes: String(notebook) }),
    }
    const chained = new LabSerializer(new LabMigrationChain([step]))
    const old = { ...JSON.parse(serializer.serialize(sampleLab())), schemaVersion: 1, notebook: 'old notes' }
    delete old.notes
    const result = chained.parse(old)
    expect(okDoc(result).notes).toBe('old notes')
    expect(result).toMatchObject({ origin: 1 })

    const failing = new LabSerializer(
      new LabMigrationChain([
        {
          from: 1,
          migrate: () => {
            throw new Error('boom')
          },
        },
      ]),
    )
    const errors = errorsOf(failing.parse(old))
    expectLabMessage(errors[0], 'lab:import.migrationFailed')
    expect(errors[0]?.params).toEqual({ version: 1, detail: 'boom' })
  })
})
