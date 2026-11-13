import { useCallback, useState } from 'react'
import type { LabDocument } from '../../../domain'
import { labSerializer } from '../../../lab/LabSerializer'
import { ShareApiClient } from '../model/ShareApiClient'
import type { ShareDraftInput } from '../model/shareContract'
import { ShareTokenStore } from '../model/ShareTokenStore'

export type ShareTexts = Omit<ShareDraftInput, 'doc'>

export type ShareCreation =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'done'; id: string; url: string; created: boolean; tokenKept: boolean }
  | { phase: 'failed'; failure: unknown }

/** Sends the lab and the page texts to the share API and keeps the delete token in this browser. */
export function useShareCreation(doc: LabDocument): { state: ShareCreation; create: (texts: ShareTexts) => void } {
  const [state, setState] = useState<ShareCreation>({ phase: 'idle' })
  const [client] = useState(() => ShareApiClient.browser())
  const [tokens] = useState(() => ShareTokenStore.browser())

  const create = useCallback(
    (texts: ShareTexts) => {
      setState({ phase: 'busy' })
      client.create({ ...texts, doc: labSerializer.serializeCompact(doc) }).then(
        (result) => {
          const tokenKept = result.deleteToken === null ? tokens.tokenOf(result.id) !== null : tokens.remember(result.id, result.deleteToken)
          setState({ phase: 'done', id: result.id, url: client.pageUrl(result.id), created: result.created, tokenKept })
        },
        (failure: unknown) => {
          console.error('The share page could not be created.', failure)
          setState({ phase: 'failed', failure })
        },
      )
    },
    [client, doc, tokens],
  )

  return { state, create }
}
