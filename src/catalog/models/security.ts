// Firewall appliance models (docs/FIREWALL_PACK.md §4). Generic names only: no vendor product names.
// Gi0/0 faces the internet (wan), Gi0/1 the inside network (lan), Gi0/2 a DMZ (ethernet). The ports
// are routed and start shut down, like router ports; nameif and security level are set per port.
import { consoleTemplate, portTemplate, PORT_SPEEDS, type PortGroup } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

const FIREWALL_CAPABILITIES = ['routing', 'deviceCli', 'firewall'] as const

function gigabitRouted(id: string, group: PortGroup) {
  return portTemplate(id, 'copper', 'routed', PORT_SPEEDS.gigabit, group)
}

function firewall(id: string, ports: CatalogDeviceModel['ports']): CatalogDeviceModel {
  return defineModel({ id, kind: 'firewall', category: 'routers', subcategory: 'security', ports, capabilities: FIREWALL_CAPABILITIES })
}

export const securityModels: readonly CatalogDeviceModel[] = [
  firewall('firewall2Port', [gigabitRouted('Gi0/0', 'wan'), gigabitRouted('Gi0/1', 'lan'), consoleTemplate()]),
  firewall('firewall3Port', [gigabitRouted('Gi0/0', 'wan'), gigabitRouted('Gi0/1', 'lan'), gigabitRouted('Gi0/2', 'ethernet'), consoleTemplate()]),
]
