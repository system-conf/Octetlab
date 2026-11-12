import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import SectionCard from '../../fields/SectionCard'
import SectionForm from '../../fields/SectionForm'
import SelectField from '../../fields/SelectField'
import { useShownErrors } from '../../fields/useShownErrors'
import { fieldGrid, type SectionProps } from '../sectionTypes'
import LocalUsersField from './LocalUsersField'
import { LOGIN_MODES, SecurityFormModel, SSH_VERSIONS, TRANSPORTS, type SecurityDraft } from './SecurityFormModel'

/**
 * SSH / Telnet / local users of an IOS device (pack 5.2, owner: agent C): the same settings as
 * `ip domain-name`, `crypto key generate rsa`, `ip ssh …`, `username …` and the vty lines.
 */
function SecuritySection({ device, access, saved, onSave }: SectionProps) {
  const { t } = useTranslation('remoteAccess')
  const management = device.features?.management ?? {}
  const [draft, setDraft] = useState<SecurityDraft>(() => SecurityFormModel.toDraft(management))
  const errors = useShownErrors()
  const validation = SecurityFormModel.validate(draft)
  const set = (change: Partial<SecurityDraft>) => setDraft((current) => ({ ...current, ...change }))

  function submit() {
    errors.markSubmitted()
    if (!SecurityFormModel.isValid(validation)) return
    onSave({ ...device, features: { ...device.features, management: SecurityFormModel.apply(management, draft) } })
  }

  function discard() {
    setDraft(SecurityFormModel.toDraft(management))
    errors.reset()
  }

  return (
    <SectionCard title={t('section.title')} icon={KeyRound} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <p className="text-xs text-fg-subtle">{t('section.intro')}</p>
        <div className={fieldGrid}>
          <InputField
            label={t('fields.domainName')}
            type="code"
            value={draft.domainName}
            onChange={(domainName) => set({ domainName })}
            hint={t('fields.domainNameHint')}
            error={errors.show(validation.fields.domainName)}
          />
          <InputField
            label={t('fields.keyBits')}
            type="number"
            value={draft.keyBits}
            onChange={(keyBits) => set({ keyBits })}
            hint={t('fields.keyBitsHint')}
            error={errors.show(validation.fields.keyBits)}
          />
          <SelectField
            label={t('fields.sshVersion')}
            value={draft.sshVersion}
            options={SSH_VERSIONS.map((value) => ({ value, label: t(`sshVersions.${value}`) }))}
            onChange={(value) => set({ sshVersion: SecurityFormModel.sshVersion(value) })}
          />
          <InputField label={t('fields.timeout')} type="number" value={draft.timeout} onChange={(timeout) => set({ timeout })} error={errors.show(validation.fields.timeout)} />
          <InputField label={t('fields.retries')} type="number" value={draft.retries} onChange={(retries) => set({ retries })} error={errors.show(validation.fields.retries)} />
        </div>
        <h4 className="text-sm font-medium text-fg">{t('fields.vty')}</h4>
        <div className={fieldGrid}>
          <SelectField
            label={t('fields.transport')}
            value={draft.transport}
            options={TRANSPORTS.map((value) => ({ value, label: t(`transports.${value}`) }))}
            onChange={(value) => set({ transport: SecurityFormModel.transport(value) })}
          />
          <SelectField
            label={t('fields.login')}
            value={draft.login}
            options={LOGIN_MODES.map((value) => ({ value, label: t(`loginModes.${value}`) }))}
            onChange={(value) => set({ login: SecurityFormModel.login(value) })}
            hint={t(`loginHints.${draft.login}`)}
          />
          <InputField label={t('fields.linePassword')} type="code" value={draft.linePassword} onChange={(linePassword) => set({ linePassword })} hint={t('fields.linePasswordHint')} />
        </div>
        <h4 className="text-sm font-medium text-fg">{t('fields.users')}</h4>
        <LocalUsersField users={draft.users} errors={validation.users} showError={errors.show} onChange={(users) => set({ users })} />
      </SectionForm>
    </SectionCard>
  )
}

export default SecuritySection
