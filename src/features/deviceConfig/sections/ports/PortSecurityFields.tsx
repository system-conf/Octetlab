import { useTranslation } from 'react-i18next'
import type { Device } from '../../../../domain'
import type { LocalizedMessage } from '../../../../domain/Messages'
import InputField from '../../fields/InputField'
import SelectField from '../../fields/SelectField'
import { pick } from '../../model/formTypes'
import type { PortErrors } from '../../model/PortEditorModel'
import { NAT_ROLE_CHOICES, PortSecurityModel, type PortSecurityDraft } from '../../model/PortSecurityModel'
import { fieldGrid } from '../sectionTypes'

interface PortSecurityFieldsProps {
  device: Device
  role: string
  draft: PortSecurityDraft
  errors: PortErrors
  show: (message: LocalizedMessage | undefined) => string | undefined
  onChange: (security: PortSecurityDraft) => void
}

/** Pack 5.2: `ip access-group` in / out and `ip nat inside|outside` of a routed port. */
function PortSecurityFields({ device, role, draft, errors, show, onChange }: PortSecurityFieldsProps) {
  const { t } = useTranslation(['acl', 'nat'])
  if (!PortSecurityModel.showsAcl(device, role)) return null
  const change = (patch: Partial<PortSecurityDraft>) => onChange({ ...draft, ...patch })
  return (
    <div className={fieldGrid}>
      <InputField label={t('acl:port.inbound')} value={draft.aclIn} onChange={(aclIn) => change({ aclIn })} hint={t('acl:port.hint')} error={show(errors.fields.aclIn)} maxLength={200} />
      <InputField label={t('acl:port.outbound')} value={draft.aclOut} onChange={(aclOut) => change({ aclOut })} error={show(errors.fields.aclOut)} maxLength={200} />
      {PortSecurityModel.showsNat(device, role) && (
        <SelectField
          label={t('nat:port.role')}
          value={draft.natRole}
          options={NAT_ROLE_CHOICES.map((choice) => ({ value: choice, label: t(`nat:port.${choice === '' ? 'none' : choice}`) }))}
          onChange={(value) => {
            const natRole = pick(NAT_ROLE_CHOICES, value)
            if (natRole !== undefined) change({ natRole })
          }}
        />
      )}
    </div>
  )
}

export default PortSecurityFields
