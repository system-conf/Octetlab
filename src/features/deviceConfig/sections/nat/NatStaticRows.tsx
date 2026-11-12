import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import SelectField from '../../fields/SelectField'
import { patchAt, removeAt } from '../../model/formTypes'
import { fieldGrid, type ShowError } from '../sectionTypes'
import { NAT_STATIC_PROTOCOLS, type NatErrors, NatFormModel, type NatStaticDraft } from './NatFormModel'

interface NatStaticRowsProps {
  statics: NatStaticDraft[]
  errors: NatErrors['statics']
  show: ShowError
  onChange: (statics: NatStaticDraft[]) => void
}

/** `ip nat inside source static [tcp|udp] <local> [port] <global> [port]` rows. */
function NatStaticRows({ statics, errors, show, onChange }: NatStaticRowsProps) {
  const { t } = useTranslation('nat')
  const protocolOptions = NAT_STATIC_PROTOCOLS.map((value) => ({ value, label: t(`form.protocols.${value === '' ? 'address' : value}`) }))
  return (
    <>
      <h4 className="text-sm font-medium text-fg">{t('form.statics')}</h4>
      <p className="text-xs text-fg-subtle">{t('form.staticsHint')}</p>
      <RowList
        items={statics}
        keyOf={(row) => row.key}
        titleOf={(_, index) => t('form.static', { index: index + 1 })}
        emptyText={t('form.noStatics')}
        addLabel={t('form.addStatic')}
        onAdd={() => onChange([...statics, NatFormModel.newStatic()])}
        removeLabelOf={(_, index) => t('form.removeStatic', { index: index + 1 })}
        onRemove={(index) => onChange(removeAt(statics, index))}
        renderRow={(row, index) => {
          const rowErrors = errors[index] ?? {}
          const patch = (change: Partial<NatStaticDraft>) => onChange(patchAt(statics, index, change))
          const ported = row.protocol !== ''
          return (
            <div className={fieldGrid}>
              <SelectField
                label={t('form.protocol')}
                value={row.protocol}
                options={protocolOptions}
                onChange={(value) => {
                  const protocol = NatFormModel.protocol(value)
                  if (protocol !== undefined) patch({ protocol })
                }}
              />
              <span aria-hidden="true" className="hidden @md:block" />
              <InputField label={t('form.insideLocal')} type="address" value={row.insideLocal} onChange={(insideLocal) => patch({ insideLocal })} error={show(rowErrors.insideLocal)} />
              {ported && <InputField label={t('form.localPort')} type="number" value={row.localPort} onChange={(localPort) => patch({ localPort })} error={show(rowErrors.localPort)} />}
              <InputField label={t('form.insideGlobal')} type="address" value={row.insideGlobal} onChange={(insideGlobal) => patch({ insideGlobal })} error={show(rowErrors.insideGlobal)} />
              {ported && <InputField label={t('form.globalPort')} type="number" value={row.globalPort} onChange={(globalPort) => patch({ globalPort })} error={show(rowErrors.globalPort)} />}
            </div>
          )
        }}
      />
    </>
  )
}

export default NatStaticRows
