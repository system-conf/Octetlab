import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import { patchAt, removeAt } from '../../model/formTypes'
import { fieldGrid, type ShowError } from '../sectionTypes'
import { type NatErrors, NatFormModel, type NatPoolDraft } from './NatFormModel'

interface NatPoolRowsProps {
  pools: NatPoolDraft[]
  errors: NatErrors['pools']
  show: ShowError
  onChange: (pools: NatPoolDraft[]) => void
}

/** `ip nat pool <name> <start> <end> netmask <mask>` rows. */
function NatPoolRows({ pools, errors, show, onChange }: NatPoolRowsProps) {
  const { t } = useTranslation('nat')
  return (
    <>
      <h4 className="text-sm font-medium text-fg">{t('form.pools')}</h4>
      <RowList
        items={pools}
        keyOf={(row) => row.key}
        titleOf={(row, index) => (row.name.trim() === '' ? t('form.pool', { index: index + 1 }) : row.name)}
        emptyText={t('form.noPools')}
        addLabel={t('form.addPool')}
        onAdd={() => onChange([...pools, NatFormModel.newPool()])}
        removeLabelOf={(_, index) => t('form.removePool', { index: index + 1 })}
        onRemove={(index) => onChange(removeAt(pools, index))}
        renderRow={(row, index) => {
          const rowErrors = errors[index] ?? {}
          const patch = (change: Partial<NatPoolDraft>) => onChange(patchAt(pools, index, change))
          return (
            <div className={fieldGrid}>
              <InputField label={t('form.poolName')} type="code" value={row.name} onChange={(name) => patch({ name })} error={show(rowErrors.name)} maxLength={64} />
              <InputField label={t('form.netmask')} type="address" value={row.netmask} onChange={(netmask) => patch({ netmask })} error={show(rowErrors.netmask)} />
              <InputField label={t('form.start')} type="address" value={row.start} onChange={(start) => patch({ start })} error={show(rowErrors.start)} />
              <InputField label={t('form.end')} type="address" value={row.end} onChange={(end) => patch({ end })} error={show(rowErrors.end)} />
            </div>
          )
        }}
      />
    </>
  )
}

export default NatPoolRows
