import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import SectionCard from '../../fields/SectionCard'
import SectionForm from '../../fields/SectionForm'
import SelectField from '../../fields/SelectField'
import { useShownErrors } from '../../fields/useShownErrors'
import { anyRowErrors, patchAt, pick, removeAt } from '../../model/formTypes'
import { fieldGrid, type SectionProps } from '../sectionTypes'
import AclEntriesField from './AclEntriesField'
import { ACL_TYPES, AccessListFormModel, type AccessListDraft } from './AccessListFormModel'

/** Access lists of a router / L3 switch (pack 5.2): name, type and the entries as IOS lines. */
function AccessListsSection({ device, access, saved, onSave }: SectionProps) {
  const { t } = useTranslation('acl')
  const [drafts, setDrafts] = useState<AccessListDraft[]>(() => AccessListFormModel.toDrafts(device))
  const errors = useShownErrors()
  const validation = AccessListFormModel.validate(drafts)

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation)) return
    onSave(AccessListFormModel.apply(device, drafts))
  }

  function discard() {
    setDrafts(AccessListFormModel.toDrafts(device))
    errors.reset()
  }

  const titleOf = (draft: AccessListDraft) => (draft.name.trim() === '' ? t('section.itemNew') : t('section.item', { name: draft.name.trim() }))

  return (
    <SectionCard title={t('section.title')} icon={ShieldCheck} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <p className="text-xs text-fg-subtle">{t('section.intro')}</p>
        <RowList
          items={drafts}
          keyOf={(draft) => draft.key}
          titleOf={titleOf}
          emptyText={t('section.empty')}
          addLabel={t('section.add')}
          onAdd={() => setDrafts((current) => [...current, AccessListFormModel.newDraft()])}
          removeLabelOf={(draft) => t('section.remove', { name: draft.name.trim() })}
          onRemove={(index) => setDrafts((current) => removeAt(current, index))}
          renderRow={(draft, index) => {
            const rowErrors = validation[index] ?? {}
            const patch = (change: Partial<AccessListDraft>) => setDrafts((current) => patchAt(current, index, change))
            return (
              <div className="flex flex-col gap-3">
                <div className={fieldGrid}>
                  <InputField
                    label={t('section.name')}
                    type="code"
                    value={draft.name}
                    onChange={(name) => patch({ name })}
                    hint={t('section.nameHint')}
                    error={errors.show(rowErrors.name)}
                    maxLength={64}
                  />
                  <SelectField
                    label={t('section.type')}
                    value={draft.type}
                    options={ACL_TYPES.map((type) => ({ value: type, label: t(type === 'standard' ? 'section.typeStandard' : 'section.typeExtended') }))}
                    onChange={(value) => {
                      const type = pick(ACL_TYPES, value)
                      if (type !== undefined) patch({ type })
                    }}
                  />
                </div>
                <AclEntriesField
                  label={t('section.entries')}
                  value={draft.entriesText}
                  onChange={(entriesText) => patch({ entriesText })}
                  hint={t('section.entriesHint')}
                  error={errors.show(rowErrors.entries)}
                />
              </div>
            )
          }}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default AccessListsSection
