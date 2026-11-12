import { useTranslation } from 'react-i18next'
import CheckboxField from '../../fields/CheckboxField'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import SelectField from '../../fields/SelectField'
import { patchAt, removeAt } from '../../model/formTypes'
import { fieldGrid, type ShowError } from '../sectionTypes'
import { NAT_TARGET_KINDS, type NatErrors, NatFormModel, type NatRuleDraft } from './NatFormModel'

interface NatRuleRowsProps {
  rules: NatRuleDraft[]
  errors: NatErrors['rules']
  show: ShowError
  /** Pool names of the draft, for the pool select. */
  poolNames: readonly string[]
  interfaceIds: readonly string[]
  onChange: (rules: NatRuleDraft[]) => void
}

/** Keeps a value that is no longer offered visible, so its error makes sense. */
function withCurrent(values: readonly string[], current: string): string[] {
  return current === '' || values.includes(current) ? [...values] : [...values, current]
}

/** `ip nat inside source list <acl> {pool <name> | interface <if>} [overload]` rows. */
function NatRuleRows({ rules, errors, show, poolNames, interfaceIds, onChange }: NatRuleRowsProps) {
  const { t } = useTranslation('nat')
  const choose = t('form.choose')
  return (
    <>
      <h4 className="text-sm font-medium text-fg">{t('form.rules')}</h4>
      <p className="text-xs text-fg-subtle">{t('form.rulesHint')}</p>
      <RowList
        items={rules}
        keyOf={(row) => row.key}
        titleOf={(_, index) => t('form.rule', { index: index + 1 })}
        emptyText={t('form.noRules')}
        addLabel={t('form.addRule')}
        onAdd={() => onChange([...rules, NatFormModel.newRule()])}
        removeLabelOf={(_, index) => t('form.removeRule', { index: index + 1 })}
        onRemove={(index) => onChange(removeAt(rules, index))}
        renderRow={(row, index) => {
          const rowErrors = errors[index] ?? {}
          const patch = (change: Partial<NatRuleDraft>) => onChange(patchAt(rules, index, change))
          return (
            <div className={fieldGrid}>
              <InputField label={t('form.acl')} type="code" value={row.aclName} onChange={(aclName) => patch({ aclName })} error={show(rowErrors.aclName)} maxLength={64} />
              <SelectField
                label={t('form.target')}
                value={row.targetKind}
                options={NAT_TARGET_KINDS.map((value) => ({ value, label: t(`form.targets.${value}`) }))}
                onChange={(value) => {
                  const targetKind = NatFormModel.targetKind(value)
                  if (targetKind !== undefined) patch({ targetKind })
                }}
              />
              {row.targetKind === 'pool' ? (
                <SelectField
                  label={t('form.poolName')}
                  value={row.poolName}
                  options={[{ value: '', label: choose }, ...withCurrent(poolNames, row.poolName).map((name) => ({ value: name, label: name }))]}
                  onChange={(poolName) => patch({ poolName })}
                  error={show(rowErrors.poolName)}
                />
              ) : (
                <SelectField
                  label={t('form.interface')}
                  value={row.interfaceId}
                  options={[{ value: '', label: choose }, ...withCurrent(interfaceIds, row.interfaceId).map((id) => ({ value: id, label: id }))]}
                  onChange={(interfaceId) => patch({ interfaceId })}
                  error={show(rowErrors.interfaceId)}
                />
              )}
              <CheckboxField label={t('form.overload')} checked={row.overload} onChange={(overload) => patch({ overload })} hint={t('form.overloadHint')} />
            </div>
          )
        }}
      />
    </>
  )
}

export default NatRuleRows
