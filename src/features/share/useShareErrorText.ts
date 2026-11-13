import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ShareApiError, type ShareFailure } from './model/ShareApiClient'

/** The friendly tr/en sentence for a share failure (the technical detail stays in the console). */
export function useShareErrorText(): (failure: unknown) => string {
  const { t } = useTranslation('share')
  return useCallback(
    (failure: unknown) => {
      const code: ShareFailure = failure instanceof ShareApiError ? failure.code : 'unexpected'
      switch (code) {
        case 'invalidRequest':
          return t('errors.invalidRequest')
        case 'invalidLab':
          return t('errors.invalidLab')
        case 'tooLarge':
          return t('errors.tooLarge')
        case 'notFound':
          return t('errors.notFound')
        case 'forbidden':
          return t('errors.forbidden')
        case 'tooManyRequests':
          return t('errors.tooManyRequests')
        case 'unavailable':
          return t('errors.unavailable')
        case 'unexpected':
          return t('errors.unexpected')
      }
    },
    [t],
  )
}
