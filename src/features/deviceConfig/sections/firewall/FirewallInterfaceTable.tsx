import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../../shared/focusRing'
import { type FieldErrors, patchAt } from '../../model/formTypes'
import type { ShowError } from '../sectionTypes'
import type { InterfaceRowDraft } from './FirewallFormModel'
import { type FirewallInterfaceField, FirewallInterfaceRules } from './FirewallInterfaceRules'

interface FirewallInterfaceTableProps {
  rows: InterfaceRowDraft[]
  errors: FieldErrors<FirewallInterfaceField>[]
  show: ShowError
  onChange: (rows: InterfaceRowDraft[]) => void
}

const inputClass = 'w-full min-w-0 rounded-md border px-2 py-1 font-mono text-sm disabled:bg-surface-muted disabled:text-fg-subtle'

/** What the firewall uses for a row while it is edited: the typed level, the default, or no traffic. */
function useEffectiveText(row: InterfaceRowDraft): string {
  const { t } = useTranslation('firewall')
  const nameif = row.nameif.trim()
  if (nameif === '') return t('interfaces.noName')
  const level = FirewallInterfaceRules.parseLevel(row.securityLevel)
  if (level === null) return ''
  const value = level !== undefined ? String(level) : t('interfaces.defaultLevel', { level: FirewallInterfaceRules.effectiveLevel({ nameif }) })
  return t('interfaces.effective', { value })
}

interface RowProps {
  row: InterfaceRowDraft
  errors: FieldErrors<FirewallInterfaceField>
  show: ShowError
  onPatch: (patch: Partial<InterfaceRowDraft>) => void
}

function InterfaceRow({ row, errors, show, onPatch }: RowProps) {
  const { t } = useTranslation('firewall')
  const id = useId()
  const nameError = show(errors.nameif)
  const levelError = show(errors.securityLevel)
  const effective = useEffectiveText(row)
  const unnamed = row.nameif.trim() === ''
  return (
    <>
      <tr className="border-t border-border/60 align-top">
        <th scope="row" className="pt-1.5 pe-2 text-start font-mono font-medium text-fg" dir="ltr">
          {row.id}
        </th>
        <td className="pt-1.5 pe-2">
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            dir="ltr"
            maxLength={200}
            value={row.nameif}
            onChange={(event) => onPatch({ nameif: event.target.value })}
            aria-label={t('interfaces.nameifOf', { port: row.id })}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={`${id}-state`}
            className={`${inputClass} ${nameError ? 'border-rose-400' : 'border-border-strong'} ${focusRing}`}
          />
        </td>
        <td className="pt-1.5">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            maxLength={3}
            value={row.securityLevel}
            onChange={(event) => onPatch({ securityLevel: event.target.value })}
            aria-label={t('interfaces.levelOf', { port: row.id })}
            aria-invalid={levelError ? true : undefined}
            aria-describedby={`${id}-state`}
            className={`${inputClass} ${levelError ? 'border-rose-400' : 'border-border-strong'} ${focusRing}`}
          />
        </td>
      </tr>
      <tr>
        <td />
        <td colSpan={2} id={`${id}-state`} className="pt-0.5 pb-1.5 text-xs">
          {effective !== '' && <p className={unnamed ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted'}>{effective}</p>}
          {nameError && <p className="text-rose-700 dark:text-rose-300">{nameError}</p>}
          {levelError && <p className="text-rose-700 dark:text-rose-300">{levelError}</p>}
        </td>
      </tr>
    </>
  )
}

/** One row per routed interface: nameif, security level and the level in effect (D3, D8). */
function FirewallInterfaceTable({ rows, errors, show, onChange }: FirewallInterfaceTableProps) {
  const { t } = useTranslation('firewall')
  return (
    <>
      <h4 className="text-sm font-medium text-fg">{t('interfaces.title')}</h4>
      <p className="text-xs text-fg-subtle">{t('interfaces.hint')}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t('interfaces.empty')}</p>
      ) : (
        <table className="w-full table-fixed text-start text-sm">
          <colgroup>
            <col className="w-16" />
            <col />
            <col className="w-16" />
          </colgroup>
          <thead className="text-xs text-fg-subtle">
            <tr>
              <th scope="col" className="pe-2 text-start font-medium">
                {t('interfaces.port')}
              </th>
              <th scope="col" className="pe-2 text-start font-medium">
                {t('interfaces.nameif')}
              </th>
              <th scope="col" className="text-start font-medium">
                {t('interfaces.level')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <InterfaceRow key={row.id} row={row} errors={errors[index] ?? {}} show={show} onPatch={(patch) => onChange(patchAt(rows, index, patch))} />
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

export default FirewallInterfaceTable
