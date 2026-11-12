// The service objects the tools use, wired once per request from the Worker's bindings.
import { CatalogBrowser } from '../catalog/CatalogBrowser'
import { CliConfigApplier } from '../cli/CliConfigApplier'
import { CommandRunner } from '../cli/CommandRunner'
import { DeviceCliRunner } from '../cli/DeviceCliRunner'
import { HostTerminalRunner } from '../cli/HostTerminalRunner'
import { DeviceAccess } from '../lab/DeviceAccess'
import { DeviceNamer } from '../lab/DeviceNamer'
import { HostConfigurator } from '../lab/HostConfigurator'
import { LabSummary } from '../lab/LabSummary'
import { LabTopology } from '../lab/LabTopology'
import { LayoutPlanner } from '../lab/LayoutPlanner'
import { ShareLinks } from '../lab/ShareLinks'
import { LabBuilder } from '../lab/LabBuilder'
import type { LabRooms } from '../live/LabRooms'
import { LiveLinks } from '../live/LiveLinks'
import type { KeyValueStore } from '../store/KeyValueStore'
import { LabStore } from '../store/LabStore'
import { englishMessages, type EnglishMessages } from '../text/EnglishMessages'

export interface OctetlabServicesConfig {
  /** One live room per lab (Durable Objects). */
  rooms: LabRooms
  /** Labs saved in KV before live labs (read-only fallback, docs/LIVE_LABS.md §4). */
  legacyStore: KeyValueStore
  /** Web app page that opens share links. */
  appLabUrl: string
  /** Web app origin for live links. */
  appOrigin: string
  now?: () => Date
}

export class OctetlabServices {
  readonly messages: EnglishMessages = englishMessages
  readonly labs: LabStore
  readonly catalog: CatalogBrowser
  readonly devices: DeviceAccess
  readonly topology: LabTopology
  readonly hosts: HostConfigurator
  readonly cliConfig: CliConfigApplier
  readonly commands: CommandRunner
  readonly summary = new LabSummary()
  readonly shareLinks: ShareLinks
  readonly liveLinks: LiveLinks
  readonly builder: LabBuilder

  constructor(config: OctetlabServicesConfig) {
    const messages = this.messages
    this.labs = new LabStore({ rooms: config.rooms, legacy: config.legacyStore, messages, ...(config.now === undefined ? {} : { now: config.now }) })
    this.catalog = new CatalogBrowser(messages)
    this.devices = new DeviceAccess(messages)
    this.topology = new LabTopology({
      catalog: this.catalog,
      devices: this.devices,
      namer: new DeviceNamer(messages),
      layout: new LayoutPlanner(),
      messages,
    })
    this.hosts = new HostConfigurator(this.devices)
    this.cliConfig = new CliConfigApplier(this.devices, messages)
    this.commands = new CommandRunner(this.devices, new DeviceCliRunner(this.devices, messages), new HostTerminalRunner(messages))
    this.shareLinks = new ShareLinks(messages, config.appLabUrl)
    this.liveLinks = new LiveLinks(config.appOrigin)
    this.builder = new LabBuilder({ topology: this.topology, hosts: this.hosts, cliConfig: this.cliConfig })
  }
}
