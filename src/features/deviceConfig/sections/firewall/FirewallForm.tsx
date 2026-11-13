import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Device } from '../../../../domain'
import CheckboxField from '../../fields/CheckboxField'
import InputField from '../../fields/InputField'
import SectionForm from '../../fields/SectionForm'
import { useShownErrors } from '../../fields/useShownErrors'
import { fieldGrid } from '../sectionTypes'
import { type FirewallDraft, FirewallFormModel, TIMEOUT_KEYS } from './FirewallFormModel'
import FirewallInterfaceTable from './FirewallInterfaceTable'

interface FirewallFormProps {
  device: Device
  editable: boolean
  onSave: (next: Device) => void
}

/**
 * The editable part of the Firewall card. The card remounts it (via `key`) when the saved interface
 * settings change, the panel when `features.firewall` changes; either resets the draft.
 */
function FirewallForm({ device, editable, onSave }: FirewallFormProps) {
  const { t } = useTranslation('firewall')
  const [draft, setDraft] = useState<FirewallDraft>(() => FirewallFormModel.toDraft(device))
  const errors = useShownErrors()
  const validation = FirewallFormModel.validate(draft)
  const set = (change: Partial<FirewallDraft>) => setDraft((current) => ({ ...current, ...change }))

  function submit() {
    errors.markSubmitted()
    if (!FirewallFormModel.isValid(validation)) return
    onSave(FirewallFormModel.apply(device, draft))
  }

  function discard() {
    setDraft(FirewallFormModel.toDraft(device))
    errors.reset()
  }

  return (
    <SectionForm editable={editable} onSubmit={submit} onDiscard={discard}>
      <p className="text-xs text-fg-subtle">{t('section.intro')}</p>
      <FirewallInterfaceTable rows={draft.interfaces} errors={validation.interfaces} show={errors.show} onChange={(interfaces) => set({ interfaces })} />
      <h4 className="text-sm font-medium text-fg">{t('rules.title')}</h4>
      <CheckboxField
        label={t('rules.interInterface')}
        checked={draft.sameSecurityInterInterface}
        onChange={(sameSecurityInterInterface) => set({ sameSecurityInterInterface })}
        hint={t('rules.interInterfaceHint')}
      />
      <CheckboxField
        label={t('rules.intraInterface')}
        checked={draft.sameSecurityIntraInterface}
        onChange={(sameSecurityIntraInterface) => set({ sameSecurityIntraInterface })}
        hint={t('rules.intraInterfaceHint')}
      />
      <h4 className="text-sm font-medium text-fg">{t('icmp.title')}</h4>
      <CheckboxField label={t('icmp.inspect')} checked={draft.inspectIcmp} onChange={(inspectIcmp) => set({ inspectIcmp })} hint={t('icmp.hint')} />
      <h4 className="text-sm font-medium text-fg">{t('timeouts.title')}</h4>
      <p className="text-xs text-fg-subtle">{t('timeouts.hint')}</p>
      <div className={fieldGrid}>
        {TIMEOUT_KEYS.map((key) => (
          <InputField
            key={key}
            label={t(`timeouts.${key}`)}
            type="number"
            maxLength={7}
            value={draft.timeouts[key]}
            onChange={(value) => set({ timeouts: { ...draft.timeouts, [key]: value } })}
            hint={t(`timeouts.${key}Hint`)}
            error={errors.show(validation.timeouts[key])}
          />
        ))}
      </div>
    </SectionForm>
  )
}

export default FirewallForm
