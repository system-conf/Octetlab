import { useId } from 'react'
import { focusRing } from '../../../shared/focusRing'

interface AclEntriesFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
}

/** Multi-line, monospace text of an access list's entries (one IOS entry per line). */
function AclEntriesField({ label, value, onChange, hint, error }: AclEntriesFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter((part) => part !== '').join(' ')
  const rows = Math.min(12, Math.max(3, value.split('\n').length + 1))

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        dir="ltr"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={`w-full min-w-0 rounded-md border px-2 py-1.5 font-mono text-sm disabled:bg-surface-muted disabled:text-fg-subtle ${
          error ? 'border-rose-400' : 'border-border-strong'
        } ${focusRing}`}
      />
      {hint && (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  )
}

export default AclEntriesField
