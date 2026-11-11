import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { findDeviceModel, PortFactory } from '../../catalog'
import type { Device } from '../../domain'
import { PreferencesProvider, PreferencesStore, type DeviceStyle } from '../../preferences'
import { memoryStorage } from '../../preferences/testStorage'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import PhysicalTab from './PhysicalTab'

function deviceOf(modelId: string, powered = true): Device {
  const model = findDeviceModel(modelId)
  if (!model) throw new Error(modelId)
  return { ...PortFactory.createDevice(model, modelId, modelId, { baseMac: '02:00:00:00:02:01' }), powered }
}

function render(device: Device, style: DeviceStyle = 'simple', policy = ExerciseLockPolicy.none): string {
  const store = new PreferencesStore(memoryStorage())
  store.set('map.deviceStyle', style)
  return renderToString(
    <PreferencesProvider store={store}>
      <PhysicalTab device={device} state={{ devices: [device], links: [] }} policy={policy} onUpdate={() => undefined} />
    </PreferencesProvider>,
  )
}

describe('PhysicalTab', () => {
  it('draws one focusable port per socket and a power button', () => {
    const html = render(deviceOf('switch24'))
    expect(html.match(/data-port="Fa0\/\d+"/g)?.length).toBeGreaterThanOrEqual(24)
    expect(html).toContain('data-port="Console"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-panel-look="classic"')
  })

  it('follows the realistic device style', () => {
    expect(render(deviceOf('router3Port'), 'realistic')).toContain('data-panel-look="realistic"')
  })

  it('locks the power button when the exercise locks power', () => {
    const policy = new ExerciseLockPolicy([{ scope: 'section', deviceId: 'pc', section: 'power', access: 'readOnly' }], [])
    const html = render(deviceOf('pc', false), 'classic', policy)
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('physical.off')
  })
})
