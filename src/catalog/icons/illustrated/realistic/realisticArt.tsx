// The realistic picture set (Preferences → Map → device style "realistic"): real-looking hardware,
// assembled from the per-group drawing files. Gradients come from RealisticIconDefs.
import type { IllustrationSet } from '../illustratedTypes'
import { REALISTIC_END_DEVICE_ART } from './realisticEndDeviceArt'
import { REALISTIC_INFRA_ART } from './realisticInfraArt'
import { REALISTIC_NETWORK_ART } from './realisticNetworkArt'
import { REALISTIC_VENUE_ART } from './realisticVenueArt'

export const REALISTIC_ART: IllustrationSet = {
  ...REALISTIC_NETWORK_ART,
  ...REALISTIC_INFRA_ART,
  ...REALISTIC_END_DEVICE_ART,
  ...REALISTIC_VENUE_ART,
}
