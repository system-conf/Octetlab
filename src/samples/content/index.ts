// Sample lab content (SL2): every "now" and "Phase 3" row of docs/SAMPLE_LABS.md, plus the pack 5.2
// security row (plus the firewall pack's sample in the same category), in catalogue order.
import type { SampleDefinition } from '../contract'
import { basicsSamples } from './basicsSamples'
import { dhcpSamples } from './dhcpSamples'
import { dnsSamples } from './dnsSamples'
import { firewallSamples } from './firewallSamples'
import { packetViewSamples } from './packetViewSamples'
import { routingSamples } from './routingSamples'
import { securitySamples } from './securitySamples'
import { switchingSamples } from './switchingSamples'

export const contentSamples: readonly SampleDefinition[] = [
  ...basicsSamples,
  ...dhcpSamples,
  ...dnsSamples,
  ...switchingSamples,
  ...routingSamples,
  ...packetViewSamples,
  ...securitySamples,
  ...firewallSamples,
]
