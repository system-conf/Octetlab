import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Device, DeviceModel, Port } from '../../../../domain'
import { focusRing } from '../../../shared/focusRing'
import CheckboxField from '../../fields/CheckboxField'
import InputField from '../../fields/InputField'
import SectionForm from '../../fields/SectionForm'
import SelectField from '../../fields/SelectField'
import { useShownErrors } from '../../fields/useShownErrors'
import type { ConfigAccess } from '../../model/ConfigLocks'
import { DeviceSections } from '../../model/DeviceSections'
import { pick } from '../../model/formTypes'
import {
  ADDRESSING_MODES,
  AUTO_SPEED,
  DUPLEX_MODES,
  PortEditorModel,
  ROLE_CHOICES,
  type PortDraft,
} from '../../model/PortEditorModel'
import { fieldGrid } from '../sectionTypes'
import PortSecurityFields from './PortSecurityFields'
import SubInterfaceList from './SubInterfaceList'
import SwitchportFields from './SwitchportFields'

interface PortEditorProps {
  device: Device
  port: Port
  model: DeviceModel | undefined
  access: ConfigAccess
  onSave: (next: Device) => void
  onClose: () => void
}

/**
 * Settings of one port by role. The parent remounts it (via `key`) when the saved port changes,
 * which resets the draft.
 */
function PortEditor({ device, port, model, access, onSave, onClose }: PortEditorProps) {
  const { t } = useTranslation(['deviceConfig', 'catalog'])
  const [draft, setDraft] = useState<PortDraft>(() => PortEditorModel.toDraft(port))
  const errors = useShownErrors()
  const titleId = useId()
  const options = PortEditorModel.options(device, model, port)
  const validation = PortEditorModel.validate(draft, port, device)
  const change = (patch: Partial<PortDraft>) => setDraft((current) => ({ ...current, ...patch }))

  function submit() {
    errors.markSubmitted()
    if (!PortEditorModel.isValid(validation)) return
    const next = PortEditorModel.apply(draft, port)
    onSave({ ...device, ports: device.ports.map((candidate) => (candidate.id === port.id ? next : candidate)) })
  }

  function discard() {
    setDraft(PortEditorModel.toDraft(port))
    errors.reset()
  }

  const hasAddress = draft.role === 'routed' || draft.role === 'host'

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 id={titleId} className="font-mono text-sm font-semibold text-fg">
            {t('ports.editorTitle', { port: port.id })}
          </h4>
          <p className="text-xs text-fg-subtle">
            {t(`catalog:media.${port.medium}`)} · {t(`catalog:portRoles.${port.role}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('ports.close')}
          title={t('ports.close')}
          className={`rounded-md p-1.5 text-fg-subtle hover:bg-surface-muted ${focusRing}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {access === 'hidden' && <p className="text-sm text-fg-muted">{t('ports.hiddenPort')}</p>}
      {access !== 'hidden' && !DeviceSections.isConfigurablePort(port.role) && (
        <p className="text-sm text-fg-muted">{t('ports.nothingToConfigure')}</p>
      )}
      {access !== 'hidden' && DeviceSections.isConfigurablePort(port.role) && (
        <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
          {options.roleChoice && (
            <SelectField
              label={t('port.role')}
              value={draft.role}
              options={ROLE_CHOICES.map((role) => ({ value: role, label: t(`port.roles.${role}`) }))}
              onChange={(value) => {
                const role = pick(ROLE_CHOICES, value)
                if (role) change({ role })
              }}
            />
          )}
          <CheckboxField label={t('port.adminUp')} checked={draft.adminUp} onChange={(adminUp) => change({ adminUp })} />
          <div className={fieldGrid}>
            <InputField label={t('port.description')} value={draft.description} onChange={(description) => change({ description })} maxLength={240} />
            {options.speeds.length > 0 && (
              <SelectField
                label={t('port.speed')}
                value={draft.speed}
                options={[
                  { value: AUTO_SPEED, label: t('port.speedAuto') },
                  ...options.speeds.map((speed) => ({ value: String(speed), label: t('port.speedValue', { speed }) })),
                ]}
                onChange={(speed) => change({ speed })}
              />
            )}
            {options.duplex && (
              <SelectField
                label={t('port.duplex')}
                value={draft.duplex}
                options={DUPLEX_MODES.map((duplex) => ({ value: duplex, label: t(`port.duplexModes.${duplex}`) }))}
                onChange={(value) => {
                  const duplex = pick(DUPLEX_MODES, value)
                  if (duplex) change({ duplex })
                }}
              />
            )}
          </div>
          {draft.role === 'switched' && options.vlanSettings && <SwitchportFields draft={draft} errors={validation} show={errors.show} onChange={change} />}
          {draft.role === 'switched' && !options.vlanSettings && <p className="text-xs text-fg-subtle">{t('port.unmanagedVlans')}</p>}
          {hasAddress && (
            <div className={fieldGrid}>
              <SelectField
                label={t('port.addressing')}
                value={draft.addressing}
                options={ADDRESSING_MODES.map((mode) => ({ value: mode, label: t(`port.addressingModes.${mode}`) }))}
                onChange={(value) => {
                  const addressing = pick(ADDRESSING_MODES, value)
                  if (addressing) change({ addressing })
                }}
                hint={draft.addressing === 'dhcp' ? t('port.dhcpInfo') : undefined}
              />
              {draft.addressing === 'static' && (
                <>
                  <InputField
                    label={t('port.address')}
                    type="address"
                    value={draft.address}
                    onChange={(address) => change({ address })}
                    error={errors.show(validation.fields.address)}
                  />
                  <InputField
                    label={t('port.mask')}
                    type="address"
                    value={draft.mask}
                    onChange={(mask) => change({ mask })}
                    error={errors.show(validation.fields.mask)}
                  />
                </>
              )}
            </div>
          )}
          <PortSecurityFields device={device} role={draft.role} draft={draft.security} errors={validation} show={errors.show} onChange={(security) => change({ security })} />
          {PortEditorModel.hasClockRate(draft, port) && (
            <InputField
              label={t('port.clockRate')}
              type="number"
              value={draft.clockRate}
              onChange={(clockRate) => change({ clockRate })}
              hint={t('port.clockRateHint')}
              error={errors.show(validation.fields.clockRate)}
            />
          )}
          {PortEditorModel.hasSubInterfaces(draft, port) && (
            <SubInterfaceList
              parentId={port.id}
              rows={draft.subInterfaces}
              errors={validation.subInterfaces}
              show={errors.show}
              onChange={(subInterfaces) => change({ subInterfaces })}
            />
          )}
        </SectionForm>
      )}
    </section>
  )
}

export default PortEditor
