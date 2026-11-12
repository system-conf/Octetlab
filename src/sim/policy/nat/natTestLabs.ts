// Test-only labs of the NAT tests: an inside LAN behind a router with a static public WAN address.
import type { AccessList, Device, NatSettings, NetworkState, Port } from '../../../domain'
import { accessMode, labCloud, labHost, labLink, labRouter, labSwitch } from '../../../engine/testLabs'

export const WAN_IP = '203.0.113.2'
const WAN_MASK = '255.255.255.252'

/** Standard ACL `name`: permit <network> <wildcard>. */
export function permitList(name: string, network: string, wildcard: string): AccessList {
  return { name, type: 'standard', entries: [{ kind: 'standard', seq: 10, action: 'permit', source: { address: network, wildcard } }] }
}

function withRole(port: Port, role: 'inside' | 'outside'): Port {
  if (port.role !== 'routed') return port
  return { ...port, l3: { ...port.l3, features: { natRole: role } } }
}

/** `router` with Gi0/0 inside, Gi0/1 outside, the given NAT settings and access lists. */
export function natRouter(router: Device, nat: NatSettings, lists: AccessList[]): Device {
  return {
    ...router,
    ports: router.ports.map((port) => withRole(port, port.id === 'Gi0/0' ? 'inside' : 'outside')),
    features: { nat, accessLists: { lists } },
  }
}

/**
 * pc1 192.168.1.10, pc2 192.168.1.11, srv 192.168.1.50 — sw — router Gi0/0 192.168.1.1 (inside) |
 * Gi0/1 203.0.113.2/30 (outside) — cloud. Default route out of Gi0/1.
 */
export function natInternetLab(nat: NatSettings, lists: AccessList[] = [permitList('1', '192.168.1.0', '0.0.0.255')]): NetworkState {
  const router = labRouter('router', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: WAN_IP, mask: WAN_MASK }], [
    { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 },
  ])
  return {
    devices: [
      labHost('pc1', '192.168.1.10', { gateway: '192.168.1.1' }),
      labHost('pc2', '192.168.1.11', { gateway: '192.168.1.1' }),
      labHost('srv', '192.168.1.50', { gateway: '192.168.1.1' }),
      labSwitch('sw', [accessMode(1), accessMode(1), accessMode(1), accessMode(1)]),
      natRouter(router, nat, lists),
      labCloud('internet', { eth0: true }),
    ],
    links: [
      labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']),
      labLink('l2', ['pc2', 'eth0'], ['sw', 'Fa0/2']),
      labLink('l3', ['srv', 'eth0'], ['sw', 'Fa0/3']),
      labLink('l4', ['sw', 'Fa0/4'], ['router', 'Gi0/0']),
      labLink('wan', ['router', 'Gi0/1'], ['internet', 'eth0']),
    ],
  }
}

/**
 * Outside host `out` 198.51.100.10 (gateway 198.51.100.1) on router Gi0/1 (outside); inside srv
 * 192.168.1.50 on Gi0/0. Lets the outside start a connection to a static global address.
 */
export function natOutsideHostLab(nat: NatSettings): NetworkState {
  const router = labRouter('router', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: '198.51.100.1' }])
  return {
    devices: [
      labHost('srv', '192.168.1.50', { gateway: '192.168.1.1' }),
      natRouter(router, nat, [permitList('1', '192.168.1.0', '0.0.0.255')]),
      labHost('out', '198.51.100.10', { gateway: '198.51.100.1' }),
    ],
    links: [labLink('l1', ['srv', 'eth0'], ['router', 'Gi0/0'], { cable: 'copperCross' }), labLink('l2', ['router', 'Gi0/1'], ['out', 'eth0'], { cable: 'copperCross' })],
  }
}

export const NO_NAT: NatSettings = { pools: [], statics: [], dynamics: [] }
