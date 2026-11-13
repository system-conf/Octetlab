import { useId } from 'react'

interface ShareFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  /** Shown under the field; with `error` it is replaced by the error. */
  hint?: string
  error?: string | null
  placeholder?: string
  multiline?: boolean
  type?: 'text' | 'url'
}

/** One labelled text field of the share dialog, with its hint or error tied to it for screen readers. */
function ShareField({ label, value, onChange, maxLength, hint, error, placeholder, multiline = false, type = 'text' }: ShareFieldProps) {
  const id = useId()
  const noteId = `${id}Note`
  const note = error ?? hint
  const className = `w-full rounded-lg border bg-surface px-3 py-2 text-sm text-fg focus:outline-2 focus:outline-offset-1 focus:outline-accent ${error ? 'border-rose-500' : 'border-border-strong'}`
  const shared = {
    id,
    value,
    maxLength,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': note ? noteId : undefined,
    className,
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg-strong">
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}
      {note && (
        <p id={noteId} className={`text-xs ${error ? 'text-rose-700 dark:text-rose-300' : 'text-fg-subtle'}`}>
          {note}
        </p>
      )}
    </div>
  )
}

export default ShareField
