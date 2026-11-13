import { useCallback, useState } from 'react'
import { routes, useAppRoute, useAppRouter } from '../../routing'

export interface StartDialogState {
  open: boolean
  show: () => void
  /** Closes the dialog; on `/` the address becomes `/lab`, so a reload keeps working without it. */
  close: () => void
}

/**
 * Whether the Start dialog shows over the workspace. It opens when the workspace is entered through
 * `/` (`openOnEntry`), also when `/` is reached again while the workspace stays mounted, and from the
 * header button.
 */
export function useStartDialog(openOnEntry: boolean): StartDialogState {
  const router = useAppRouter()
  const route = useAppRoute()
  const [open, setOpen] = useState(openOnEntry)
  const [entry, setEntry] = useState(openOnEntry)

  // Adjust state on prop change (react.dev "You Might Not Need an Effect"): `/` reached again.
  if (entry !== openOnEntry) {
    setEntry(openOnEntry)
    if (openOnEntry) setOpen(true)
  }

  const show = useCallback(() => setOpen(true), [])
  const close = useCallback(() => {
    setOpen(false)
    if (route.name === 'landing') router.navigate(routes.lab, { replace: true })
  }, [route, router])

  return { open, show, close }
}
