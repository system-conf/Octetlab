// Running-config extension points (docs/CLI.md §6): device → IOS text. The generator walks the sections in
// `order`; the interface section asks every InterfaceConfigContributor for the lines of each interface.
import type { Device } from '../../domain'
import type { CliInterface } from './CliValues'

/** Slots of the top-level sections, IOS order. Ties keep registration order (core first). */
export const RUNNING_CONFIG_ORDER = {
  /** `version`, `service …` (core). */
  version: 0,
  /** `hostname` (core). */
  hostname: 20,
  /** `enable secret` / `enable password` (core). */
  enable: 30,
  /** `ip dhcp excluded-address`, `ip dhcp pool` blocks (C3). */
  dhcp: 40,
  /** Global `ip …` switches: `ip routing`, `no ip domain-lookup` (core), `ip dns server`, `ip name-server`. */
  ipGlobal: 50,
  /** `spanning-tree mode …` (pack 5.1). */
  spanningTree: 55,
  /** `interface …` blocks (core section + contributors). */
  interfaces: 60,
  /** `router ospf …` blocks (packs 5.3). */
  routerProtocols: 70,
  /** Firewall pack: `same-security-traffic`, `object network` blocks, `access-group … interface` (76; NAT sits at 75). */
  firewall: 76,
  /** `ip default-gateway`, `ip classless`, `ip route …` (C2 / C3). */
  ipRoutes: 80,
  /** Access lists (pack 5.2). */
  accessLists: 85,
  /** `banner motd` (core). */
  banner: 90,
  /** `line con 0`, `line aux 0`, `line vty …` (core). */
  lines: 100,
} as const

/** Slots inside an `interface` block. */
export const INTERFACE_LINE_ORDER = {
  /** `description` (core). */
  description: 10,
  /** `encapsulation dot1Q` (C3). */
  encapsulation: 15,
  /** `switchport …`, `no switchport` (C2). */
  switchport: 20,
  /** `ip address …` / `no ip address` (C3; C2 for SVIs if it wants). */
  ip: 30,
  /** `ip helper-address` (C3). */
  helper: 35,
  /** Pack features: `ip access-group`, `ip nat`, `spanning-tree portfast` … */
  features: 50,
  /** Firewall pack: `nameif`, `security-level`. */
  firewall: 55,
  /** `duplex`, `speed`, `clock rate` (core; clock rate C3). */
  physical: 80,
  /** `shutdown` (core). */
  shutdown: 90,
} as const

/** A top-level part of running-config. */
export interface RunningConfigSection {
  /** camelCase, unique. */
  readonly id: string
  /** RUNNING_CONFIG_ORDER slot (or a number between two slots). */
  readonly order: number
  /**
   * Blocks of this section; the generator writes '!' after each block. A block is a list of lines;
   * lines of a sub-mode start with one space (' network 10.0.0.0 255.0.0.0'). [] = nothing to show.
   */
  blocks(device: Device): readonly (readonly string[])[]
}

/** Lines inside one `interface` block. */
export interface InterfaceConfigContributor {
  readonly id: string
  /** INTERFACE_LINE_ORDER slot. */
  readonly order: number
  /** Lines WITHOUT the leading space ('ip address 10.0.0.1 255.0.0.0'); [] = nothing. */
  lines(device: Device, iface: CliInterface): readonly string[]
}
