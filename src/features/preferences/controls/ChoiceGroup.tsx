import { useId, type ReactNode } from 'react'
import FieldHint from './FieldHint'

export interface Choice<Value> {
  value: Value
  label: string
  /** Small decorative picture above the label (ChoiceGroup only; SelectField ignores it). */
  preview?: ReactNode
}

interface ChoiceGroupProps<Value> {
  label: string
  hint?: string
  choices: readonly Choice<Value>[]
  value: Value
  onChange: (value: Value) => void
  disabled?: boolean
}

/**
 * One of a few options as a segmented row of native radio buttons (arrow keys move and select, the
 * group is one tab stop). Wraps onto more lines on narrow screens.
 */
function ChoiceGroup<Value extends string | number>({ label, hint, choices, value, onChange, disabled }: ChoiceGroupProps<Value>) {
  const name = useId()
  const hintId = useId()
  // The wrapper takes the list's row padding: a fieldset would put it between the legend and the options.
  return (
    <div>
      <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={hint === undefined ? undefined : hintId} disabled={disabled}>
        <legend className="mb-2 text-sm font-medium text-fg">{label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {choices.map((choice) => {
            const checked = choice.value === value
            return (
              <label
                key={choice.value}
                className={`relative flex min-h-9 cursor-pointer ${choice.preview === undefined ? 'items-center' : 'flex-col items-center gap-1'} rounded-lg border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                  checked ? 'border-accent bg-accent-muted font-medium text-accent-text' : 'border-border-strong bg-surface text-fg-muted hover:bg-surface-muted'
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={String(choice.value)}
                  checked={checked}
                  onChange={() => onChange(choice.value)}
                  className="sr-only"
                />
                {choice.preview !== undefined && <span aria-hidden="true">{choice.preview}</span>}
                {choice.label}
              </label>
            )
          })}
        </div>
        {hint !== undefined && <FieldHint id={hintId}>{hint}</FieldHint>}
      </fieldset>
    </div>
  )
}

export default ChoiceGroup
