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

/** Pack 5.2: `ip access-group` in / out and `ip nat inside|outside` of a routed port; firewall pack: `nameif` and `security-level`. */
function PortSecurityFields({ device, role, draft, errors, show, onChange }: PortSecurityFieldsProps) {
  const { t } = useTranslation(['acl', 'nat', 'firewall'])
  if (!PortSecurityModel.showsAcl(device, role)) return null
  const change = (patch: Partial<PortSecurityDraft>) => onChange({ ...draft, ...patch })
  return (
    <div className={fieldGrid}>
      {PortSecurityModel.showsFirewall(device, role) && (
        <>
          <InputField
            label={t('firewall:port.nameif')}
            type="code"
            value={draft.nameif}
            onChange={(nameif) => change({ nameif })}
            hint={t('firewall:port.nameifHint')}
            error={show(errors.fields.nameif)}
            maxLength={200}
          />
          <InputField
            label={t('firewall:port.level')}
            type="number"
            value={draft.securityLevel}
            onChange={(securityLevel) => change({ securityLevel })}
            hint={t('firewall:port.levelHint')}
            error={show(errors.fields.securityLevel)}
            maxLength={3}
          />
        </>
      )}
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
