import { useTranslation } from 'react-i18next'
import { addressText } from '../../deviceConfig/info/addressText'
import type { PortPanelState } from '../model/PortPanelStatus'

/** Translated pieces of a port's description, shared by the tooltip, the port table and screen readers. */
export interface PortTexts {
  /** Address, VLAN or trunk; '' when the port has no such setting. */
  detail: string
  /** Device(s) and port at the far end of the cable; '' when nothing is attached. */
  peer: string
  condition: string
  /** One line: 'Gi0/1 · 192.168.10.1/24 · Staff Switch Fa0/8 · Up'. */
  summary: string
}

/** Peers shown by name before the rest is counted ('+2'). */
const NAMED_PEERS = 2

export function usePortTexts(): (port: PortPanelState) => PortTexts {
  const { t } = useTranslation('device')
  const { t: tConfig } = useTranslation('deviceConfig')

  return (port) => {
    let detail = ''
    switch (port.detail.kind) {
      case 'address':
        detail = addressText(tConfig, port.detail.ipv4)
        break
      case 'access':
        detail = t('physical.detail.vlan', { vlan: port.detail.vlan })
        break
      case 'trunk':
        detail = t('physical.detail.trunk')
        break
      case 'hidden':
        detail = t('physical.detail.hidden')
        break
      case 'none':
        break
    }
    const named = port.peers.slice(0, NAMED_PEERS).map((peer) => t('physical.peer', { device: peer.deviceName, port: peer.portId }))
    const rest = port.peers.length - named.length
    const peer = [...named, ...(rest > 0 ? [t('physical.morePeers', { count: rest })] : [])].join(', ')
    const condition = t(`physical.condition.${port.condition}`)
    const summary = [port.portId, detail, peer, condition].filter((part) => part !== '').join(' · ')
    return { detail, peer, condition, summary }
  }
}
