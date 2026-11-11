import { useTranslation } from 'react-i18next'
import type { PortPanelState } from '../model/PortPanelStatus'
import type { PortTexts } from './usePortTexts'

interface PortStatusTableProps {
  ports: readonly PortPanelState[]
  texts: (port: PortPanelState) => PortTexts
  hotPortId: string | null
  onHover: (portId: string | null) => void
  onPin: (portId: string) => void
}

const pillClasses = {
  lit: 'bg-success-muted text-success',
  dark: 'bg-surface-muted text-fg-subtle',
}

/** Port | Status | IP / VLAN | Connected device; the row of the highlighted port is marked. */
function PortStatusTable({ ports, texts, hotPortId, onHover, onPin }: PortStatusTableProps) {
  const { t } = useTranslation('device')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-start text-[11px] uppercase tracking-wide text-fg-subtle">
            <th scope="col" className="px-2 py-1.5 text-start font-semibold">
              {t('physical.table.port')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-start font-semibold">
              {t('physical.table.status')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-start font-semibold">
              {t('physical.table.detail')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-start font-semibold">
              {t('physical.table.peer')}
            </th>
          </tr>
        </thead>
        <tbody>
          {ports.map((port) => {
            const text = texts(port)
            return (
              <tr
                key={port.portId}
                data-port={port.portId}
                data-hot={hotPortId === port.portId ? 'true' : undefined}
                onMouseEnter={() => onHover(port.portId)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onPin(port.portId)}
                className={`cursor-default border-b border-border last:border-b-0 ${hotPortId === port.portId ? 'bg-surface-muted' : 'hover:bg-surface-subtle'}`}
              >
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-fg-strong" dir="ltr">
                  {port.portId}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${port.lit ? pillClasses.lit : pillClasses.dark}`}>
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                    {text.condition}
                  </span>
                </td>
                <td className={`px-2 py-1.5 font-mono ${text.detail === '' ? 'text-fg-subtle' : 'text-fg'}`} dir="ltr">
                  {text.detail === '' ? t('physical.table.none') : text.detail}
                </td>
                <td className={`px-2 py-1.5 ${text.peer === '' ? 'text-fg-subtle' : 'text-fg'}`}>{text.peer === '' ? t('physical.table.none') : text.peer}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default PortStatusTable
