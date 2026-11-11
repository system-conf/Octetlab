import { useTranslation } from 'react-i18next'
import { CABLE_STYLE, type ColouredCable } from '../../shared/cableStyle'

/** What the lights and plug colours mean; only the cable types plugged into this device are listed. */
function PanelLegend({ cables, hasConsole }: { cables: readonly ColouredCable[]; hasConsole: boolean }) {
  const { t } = useTranslation(['device', 'workspace'])
  return (
    <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-fg-subtle">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-link-up" />
        {t('physical.legend.up')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full border-[1.5px] border-link-down" />
        {t('physical.legend.dark')}
      </span>
      {hasConsole && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-sky-400" />
          {t('physical.legend.console')}
        </span>
      )}
      {cables.map((cable) => (
        <span key={cable} className={`inline-flex items-center gap-1.5 ${CABLE_STYLE[cable].tone}`}>
          <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-current" />
          <span className="text-fg-subtle">{t('physical.legend.plug', { cable: t(`workspace:cableTools.${cable}`) })}</span>
        </span>
      ))}
    </p>
  )
}

export default PanelLegend
