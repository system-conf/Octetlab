import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import SelectField from '../../fields/SelectField'
import { type FieldErrors, patchAt, removeAt } from '../../model/formTypes'
import { fieldGrid, type ShowError } from '../sectionTypes'
import { CREDENTIAL_KINDS, SecurityFormModel, type UserDraft, type UserField } from './SecurityFormModel'

interface LocalUsersFieldProps {
  users: readonly UserDraft[]
  errors: readonly FieldErrors<UserField>[]
  showError: ShowError
  onChange: (users: UserDraft[]) => void
}

/** The local user database (`username … privilege … secret|password …`) as editable rows. */
function LocalUsersField({ users, errors, showError, onChange }: LocalUsersFieldProps) {
  const { t } = useTranslation('remoteAccess')
  return (
    <RowList
      items={users}
      keyOf={(user) => user.key}
      titleOf={(user, index) => (user.name.trim() === '' ? t('users.item', { index: index + 1 }) : user.name)}
      emptyText={t('users.empty')}
      addLabel={t('users.add')}
      onAdd={() => onChange([...users, SecurityFormModel.newUser()])}
      removeLabelOf={(_, index) => t('users.remove', { index: index + 1 })}
      onRemove={(index) => onChange(removeAt(users, index))}
      renderRow={(user, index) => {
        const rowErrors = errors[index] ?? {}
        const patch = (change: Partial<UserDraft>) => onChange(patchAt(users, index, change))
        return (
          <div className={fieldGrid}>
            <InputField label={t('users.name')} type="code" value={user.name} onChange={(name) => patch({ name })} error={showError(rowErrors.name)} />
            <InputField
              label={t('users.privilege')}
              type="number"
              value={user.privilege}
              onChange={(privilege) => patch({ privilege })}
              hint={t('users.privilegeHint')}
              error={showError(rowErrors.privilege)}
            />
            <SelectField
              label={t('users.kind')}
              value={user.kind}
              options={CREDENTIAL_KINDS.map((value) => ({ value, label: t(`users.kinds.${value}`) }))}
              onChange={(value) => patch({ kind: SecurityFormModel.credentialKind(value) })}
            />
            <InputField label={t('users.credential')} type="code" value={user.credential} onChange={(credential) => patch({ credential })} error={showError(rowErrors.credential)} />
          </div>
        )
      }}
    />
  )
}

export default LocalUsersField
