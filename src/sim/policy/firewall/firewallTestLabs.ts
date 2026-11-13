// Test-only labs of the firewall tests: pc1 192.168.1.10 on inside Gi0/1 (level 100), srv 172.16.1.10 on
// dmz Gi0/2 (level 50), and on outside Gi0/0 (level 0) either the internet cloud (WAN 203.0.113.2/30,
// default route) or a host `out` 198.51.100.10.
import type { AccessList, AclBinding, Device, FirewallInterfaceSettings, FirewallSettings, NatRole, NatSettings, NetworkState, Port } from '../../../domain'
import { labCloud, labHost, labLink, labRouter } from '../../../engine/testLabs'

export const WAN_IP = '203.0.113.2'
export const OUT_IP = '198.51.100.10'
export const PC_IP = '192.168.1.10'
export const SRV_IP = '172.16.1.10'

export const DEFAULT_NAMEIFS: Readonly<Record<string, FirewallInterfaceSettings | null>> = {
  'Gi0/0': { nameif: 'outside' },
  'Gi0/1': { nameif: 'inside' },
  'Gi0/2': { nameif: 'dmz', securityLevel: 50 },
}

export interface FirewallLabOptions {
  readonly outside?: 'cloud' | 'host'
  readonly settings?: FirewallSettings
  /** Per port id; null = no nameif. Missing ports keep DEFAULT_NAMEIFS. */
  readonly nameifs?: Readonly<Record<string, FirewallInterfaceSettings | null>>
  readonly accessGroups?: Readonly<Record<string, AclBinding>>
  readonly lists?: readonly AccessList[]
  readonly nat?: NatSettings
  readonly natRoles?: Readonly<Record<string, NatRole>>
}

function configurePort(port: Port, options: FirewallLabOptions): Port {
  if (port.role !== 'routed') return port
  const nameif = options.nameifs?.[port.id] !== undefined ? options.nameifs[port.id] : DEFAULT_NAMEIFS[port.id]
  const accessGroups = options.accessGroups?.[port.id]
  const natRole = options.natRoles?.[port.id]
  const features = {
    ...(nameif === null || nameif === undefined ? {} : { firewall: nameif }),
    ...(accessGroups === undefined ? {} : { accessGroups }),
    ...(natRole === undefined ? {} : { natRole }),
  }
  return { ...port, l3: { ...port.l3, features } }
}

/** The firewall device `fw` of the lab. */
export function labFirewall(options: FirewallLabOptions): Device {
  const cloud = (options.outside ?? 'host') === 'cloud'
  const outside = cloud ? { id: 'Gi0/0', ip: WAN_IP, mask: '255.255.255.252' } : { id: 'Gi0/0', ip: '198.51.100.1' }
  const routes = cloud ? [{ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/0', adminDistance: 1 }] : []
  const base = labRouter('fw', [outside, { id: 'Gi0/1', ip: '192.168.1.1' }, { id: 'Gi0/2', ip: '172.16.1.1' }], routes)
  return {
    ...base,
    kind: 'firewall',
    modelId: 'firewall3Port',
    ports: base.ports.map((port) => configurePort(port, options)),
    features: {
      ...(options.settings === undefined ? {} : { firewall: options.settings }),
      ...(options.lists === undefined ? {} : { accessLists: { lists: [...options.lists] } }),
      ...(options.nat === undefined ? {} : { nat: options.nat }),
    },
  }
}

export function firewallLab(options: FirewallLabOptions = {}): NetworkState {
  const cloud = (options.outside ?? 'host') === 'cloud'
  const cross = { cable: 'copperCross' } as const
  return {
    devices: [
      labHost('pc1', PC_IP, { gateway: '192.168.1.1' }),
      labHost('srv', SRV_IP, { gateway: '172.16.1.1' }),
      labFirewall(options),
      cloud ? labCloud('internet', { eth0: true }) : labHost('out', OUT_IP, { gateway: '198.51.100.1' }),
    ],
    links: [
      labLink('l1', ['pc1', 'eth0'], ['fw', 'Gi0/1'], cross),
      labLink('l2', ['srv', 'eth0'], ['fw', 'Gi0/2'], cross),
      cloud ? labLink('wan', ['fw', 'Gi0/0'], ['internet', 'eth0']) : labLink('l3', ['fw', 'Gi0/0'], ['out', 'eth0'], cross),
    ],
  }
}

/** Extended ACL `name` with one permit of TCP to host `ip` port `port`. */
export function permitTcpTo(name: string, ip: string, port: number): AccessList {
  const any = { address: '0.0.0.0', wildcard: '255.255.255.255' }
  return {
    name,
    type: 'extended',
    entries: [{ seq: 10, kind: 'extended', action: 'permit', protocol: 'tcp', source: any, destination: { address: ip, wildcard: '0.0.0.0' }, destinationPort: { op: 'eq', port } }],
  }
}
