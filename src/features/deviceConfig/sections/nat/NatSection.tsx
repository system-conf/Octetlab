import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import SectionCard from '../../fields/SectionCard'
import SectionForm from '../../fields/SectionForm'
import { useShownErrors } from '../../fields/useShownErrors'
import { anyRowErrors } from '../../model/formTypes'
import type { SectionProps } from '../sectionTypes'
import { type NatDraft, NatFormModel } from './NatFormModel'
import NatPoolRows from './NatPoolRows'
import NatRuleRows from './NatRuleRows'
import NatStaticRows from './NatStaticRows'

/** NAT pools, static mappings and `ip nat inside source list` rules of a router (pack 5.2). */
function NatSection({ device, access, saved, onSave }: SectionProps) {
  const { t } = useTranslation('nat')
  const [draft, setDraft] = useState<NatDraft>(() => NatFormModel.toDraft(device.features?.nat))
  const errors = useShownErrors()
  const interfaceIds = NatFormModel.interfaces(device)
  const validation = NatFormModel.validate(draft, interfaceIds)
  const change = (patch: Partial<NatDraft>) => setDraft((current) => ({ ...current, ...patch }))

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation.pools) || anyRowErrors(validation.statics) || anyRowErrors(validation.rules)) return
    onSave(NatFormModel.apply(device, draft))
  }

  function discard() {
    setDraft(NatFormModel.toDraft(device.features?.nat))
    errors.reset()
  }

  return (
    <SectionCard title={t('section.title')} icon={ArrowLeftRight} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <p className="text-xs text-fg-subtle">{t('form.rolesHint')}</p>
        <NatPoolRows pools={draft.pools} errors={validation.pools} show={errors.show} onChange={(pools) => change({ pools })} />
        <NatRuleRows
          rules={draft.rules}
          errors={validation.rules}
          show={errors.show}
          poolNames={draft.pools.map((pool) => pool.name.trim()).filter((name) => name !== '')}
          interfaceIds={interfaceIds}
          onChange={(rules) => change({ rules })}
        />
        <NatStaticRows statics={draft.statics} errors={validation.statics} show={errors.show} onChange={(statics) => change({ statics })} />
      </SectionForm>
    </SectionCard>
  )
}

export default NatSection
