import { useEffect, useState } from 'react'
import type { LabDocument } from '../../../domain'
import { labSerializer } from '../../../lab/LabSerializer'
import { ShareApiClient, ShareApiError } from '../model/ShareApiClient'
import type { ShareRecord } from '../model/shareContract'

export type SharedLab = { phase: 'loading' } | { phase: 'ready'; record: ShareRecord; doc: LabDocument } | { phase: 'failed'; failure: unknown }

/** Loads one share (`/api/shares/<id>`) and reads its frozen lab. The caller keys the screen by id. */
export function useSharedLab(shareId: string): SharedLab {
  const [state, setState] = useState<SharedLab>({ phase: 'loading' })
  useEffect(() => {
    let current = true
    ShareApiClient.browser()
      .get(shareId)
      .then(
        (record) => {
          const parsed = labSerializer.parse(record.doc)
          if (!current) return
          if (parsed.ok) setState({ phase: 'ready', record, doc: parsed.doc })
          else {
            console.error(`Shared lab ${shareId} could not be read.`, parsed.errors)
            setState({ phase: 'failed', failure: new ShareApiError('invalidLab', 'stored lab does not parse') })
          }
        },
        (failure: unknown) => {
          console.error(`Shared lab ${shareId} could not be loaded.`, failure)
          if (current) setState({ phase: 'failed', failure })
        },
      )
    return () => {
      current = false
    }
  }, [shareId])
  return state
}
