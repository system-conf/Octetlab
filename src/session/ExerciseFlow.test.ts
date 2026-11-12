// Every exercise through the path the UI takes: v1 data → migrateV1Exercise (+ locks), or v2 data →
// localized Exercise → lab document → device edits via LabEditor.updateDevice under the exercise's
// lock policy → verify with SolveChecker (ExerciseAttempt).
import { createInstance, type i18n as I18n } from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Exercise, LabDocument, NetworkState } from '../domain'
import { editAddress, editHost, editSwitchport, labDevice } from '../engine/testLabs'
import { labEditor } from '../lab/LabEditor'
import enExercises from '../locales/en/exercises.json'
import trExercises from '../locales/tr/exercises.json'
import { exerciseDefinitions } from '../scenarios/exerciseDefinitions'
import { ExerciseLocalizer } from '../scenarios/ExerciseLocalizer'
import { blockGuests, overloadOffice } from '../scenarios/security/securityFixes'
import { ExerciseAttempt } from './ExerciseAttempt'
import { ExerciseLabs } from './ExerciseLabs'
import { ExerciseLockPolicy } from './ExerciseLockPolicy'

let i18n: I18n

beforeAll(async () => {
  i18n = createInstance()
  await i18n.init({
    resources: { tr: { exercises: trExercises }, en: { exercises: enExercises } },
    lng: 'en',
    fallbackLng: false,
    ns: ['exercises'],
    interpolation: { escapeValue: false },
  })
})

const labs = new ExerciseLabs(() => new Date('2026-11-06T10:00:00.000Z'))

/** The hint-3 fix of each exercise as a state edit; the test applies it device by device. */
const FIXES: Readonly<Record<string, { devices: string[]; fix: (state: NetworkState) => NetworkState }>> = {
  posGateway: { devices: ['kasa'], fix: (state) => editHost(state, 'kasa', { defaultGateway: '192.168.10.1' }) },
  printerDhcp: {
    devices: ['yazici'],
    fix: (state) =>
      editHost(editAddress(state, 'yazici', 'eth0', { addressing: 'static', address: '192.168.1.150', mask: '255.255.255.0' }), 'yazici', {
        defaultGateway: '192.168.1.1',
        dnsServers: ['192.168.1.1'],
      }),
  },
  cameraSubnet: {
    devices: ['kamera3'],
    fix: (state) =>
      editHost(editAddress(state, 'kamera3', 'eth0', { address: '192.168.1.63' }), 'kamera3', {
        defaultGateway: '192.168.1.1',
        dnsServers: ['192.168.1.1'],
      }),
  },
  kitchenVlan: { devices: ['switch'], fix: (state) => editSwitchport(state, 'switch', 'Fa0/3', { mode: 'access', accessVlan: 10 }) },
  wrongDns: { devices: ['muhasebe'], fix: (state) => editHost(state, 'muhasebe', { dnsServers: ['192.168.1.1'] }) },
  // Pack 5.2: solved only on the simulator (ExerciseAttempt uses SimSolveChecker), once the ACL / NAT policies are merged.
  cafeGuestWifi: { devices: ['router'], fix: blockGuests },
  officeSharedIp: { devices: ['router'], fix: overloadOffice },
}

function openExercise(id: string): { exercise: Exercise; doc: LabDocument } {
  const definition = exerciseDefinitions.find((candidate) => candidate.id === id)
  if (!definition) throw new Error(`exercise ${id} missing`)
  const exercise = new ExerciseLocalizer(i18n.getFixedT('en')).localize(definition)
  return { exercise, doc: labs.open(exercise) }
}

/** Applies the fix the way the settings panel does: one updateDevice per changed device, if the locks allow it. */
function applyFix(doc: LabDocument, policy: ExerciseLockPolicy, id: string): LabDocument {
  const plan = FIXES[id]
  if (!plan) throw new Error(`no fix for ${id}`)
  const fixed = plan.fix(doc.state)
  return plan.devices.reduce((current, deviceId) => {
    const before = labDevice(current.state, deviceId)
    const after = labDevice(fixed, deviceId)
    expect(policy.allowsDeviceUpdate(before, after), deviceId).toBe(true)
    expect(labEditor.deviceUpdateProblems(current, after), deviceId).toEqual([])
    return labEditor.updateDevice(current, after)
  }, doc)
}

describe.each(exerciseDefinitions.map((definition) => [definition.id]))('exercise %s in exercise mode', (id) => {
  it('opens as a topology-locked lab with localized names', () => {
    const { exercise, doc } = openExercise(id)
    expect(new ExerciseLockPolicy(exercise.locks, exercise.lab.state.links).topologyLocked).toBe(true)
    expect(doc.meta.title).toBe(exercise.texts.title)
    expect(doc.state.devices.every((device) => device.name !== device.id || device.name === '')).toBe(true)
    expect(Object.keys(doc.layout.devices).sort()).toEqual(doc.state.devices.map((device) => device.id).sort())
  })

  it('is not solved at the start and names the symptom', () => {
    const { exercise, doc } = openExercise(id)
    const attempt = ExerciseAttempt.start(exercise).verify(doc.state)
    expect(attempt.isSolved).toBe(false)
    expect(attempt.failedChecks(doc.state).length).toBeGreaterThan(0)
  })

  it('is solved by the hint-3 fix made through the settings path', () => {
    const { exercise, doc } = openExercise(id)
    const fixed = applyFix(doc, new ExerciseLockPolicy(exercise.locks, exercise.lab.state.links), id)
    const attempt = ExerciseAttempt.start(exercise).verify(fixed.state)
    expect(attempt.isSolved).toBe(true)
    expect(attempt.failedChecks(fixed.state)).toEqual([])
  })
})

describe('ExerciseAttempt', () => {
  it('reveals at most three guide steps and keeps a success', () => {
    const { exercise, doc } = openExercise('wrongDns')
    let attempt = ExerciseAttempt.start(exercise)
    for (let step = 0; step < 5; step += 1) attempt = attempt.revealGuideStep()
    expect(attempt.guideStepsRevealed).toBe(3)
    expect(attempt.lastCheck).toBeNull()
    const solved = attempt.verify(applyFix(doc, new ExerciseLockPolicy(exercise.locks, exercise.lab.state.links), 'wrongDns').state)
    expect(solved.isSolved).toBe(true)
    const broken = solved.verify(doc.state)
    expect(broken.isSolved).toBe(true)
    expect(broken.failedChecks(doc.state)).not.toEqual([])
  })
})
