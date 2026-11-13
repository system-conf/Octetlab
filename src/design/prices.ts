// Prices of the design exercises (docs/DESIGN_EXERCISES.md §6.3). Generic, realistic-feeling list
// prices in a neutral currency unit ("price units", `design:units.price`), roughly proportional to
// real small-business street prices so that quotations teach sensible trade-offs (a 48-port PoE
// switch costs much more than an 8-port one, fiber more than copper). Not tied to any vendor.
//
// Lookup (PriceCatalog): `models[device.modelId]`, else `kinds[device.kind]` (catalog models added
// later still get a price), cables by `link.cable`. Kept here, not in src/catalog: prices belong to
// the exercise rules, and a brief may pass its own PriceList.
import type { CableType, DeviceKind } from '../domain'

export interface PriceList {
  /** Price per catalog model id (`Device.modelId`). */
  models: Readonly<Record<string, number>>
  /** Fallback per device kind for models without an entry. */
  kinds: Readonly<Record<DeviceKind, number>>
  /** Price of one link by cable type (a patch cable, a fiber patch lead…); wireless is free. */
  cables: Readonly<Record<CableType, number>>
}

export const DEFAULT_PRICE_LIST: PriceList = {
  models: {
    internetCloud: 0,
    dslModem: 120,
    cableModem: 140,
    router2Port: 650,
    router3Port: 850,
    router4Port: 1100,
    router2PortSerial: 1200,
    router4PortSerial: 1600,
    switch5: 40,
    switch8: 180,
    switch8Poe: 320,
    switch16: 300,
    switch16Poe: 520,
    switch24: 450,
    switch24Poe: 800,
    switch24Gig: 900,
    switch24GigPoe: 1400,
    switch48: 850,
    switch48Poe: 1500,
    l3Switch24: 2400,
    hub8: 30,
    accessPoint: 220,
    wirelessRouter: 150,
    pc: 700,
    laptop: 900,
    printer: 300,
    multifunctionPrinter: 450,
    ipPhone: 120,
    smartphone: 500,
    tablet: 400,
    ipCamera: 180,
    pos: 650,
    kitchenDisplay: 350,
    smartTv: 600,
    server: 2500,
    rackServer: 4500,
    nvr: 900,
    firewall2Port: 1300,
    firewall3Port: 1800,
  },
  kinds: {
    internet: 0,
    router: 800,
    wirelessRouter: 150,
    switch: 400,
    l3Switch: 2400,
    hub: 30,
    accessPoint: 220,
    pc: 700,
    laptop: 900,
    server: 2500,
    printer: 300,
    ipPhone: 120,
    pos: 650,
    camera: 180,
    nvr: 900,
    kitchenDisplay: 350,
    smartphone: 500,
    tablet: 400,
    firewall: 1500,
  },
  cables: {
    copperStraight: 5,
    copperCross: 5,
    fiber: 40,
    serial: 60,
    console: 15,
    coaxial: 10,
    wireless: 0,
  },
}
