// The classic network-diagram picture set (Preferences → Map → device style "classic"): our own
// drawings in the familiar style of network diagrams. Gradients come from ClassicIconDefs.
import type { IllustrationSet } from '../illustratedTypes'
import { classicComputerArt } from './classicComputerArt'
import { classicNetworkArt } from './classicNetworkArt'
import { classicPeripheralArt } from './classicPeripheralArt'
import { classicVenueArt } from './classicVenueArt'
import { classicWanArt } from './classicWanArt'

export const CLASSIC_ART: IllustrationSet = {
  ...classicNetworkArt,
  ...classicWanArt,
  ...classicComputerArt,
  ...classicPeripheralArt,
  ...classicVenueArt,
}
