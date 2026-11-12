// Events and wire transmissions of the simulator: the timeline the event list, the inspector, the map
// animation and the result mapping read (docs/SIMULATION.md §3).
import type { LinkEnd } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import type { Pdu, WireFrame } from './Pdu'
import type { SimReason } from './SimReason'

/** OSI layer a note or decision belongs to. 5 and 6 exist for completeness and are unused. */
export type OsiLayer = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Top-most protocol of a PDU (event-list filters, colours). Protocol packs add members (stp, cdp,
 * ospf, ipv6…); exhaustive switches then fail to compile until they handle them.
 */
export type SimProtocol = 'ethernet' | 'hdlc' | 'arp' | 'ipv4' | 'icmp' | 'udp' | 'tcp' | 'dhcp' | 'dns' | 'http' | 'telnet' | 'ssh'

export const SIM_PROTOCOLS: readonly SimProtocol[] = ['ethernet', 'hdlc', 'arp', 'ipv4', 'icmp', 'udp', 'tcp', 'dhcp', 'dns', 'http', 'telnet', 'ssh']

/**
 * What a device did with a PDU (one event per device and PDU; docs/SIMULATION.md §3.2):
 * - `created`: originated here (sent when `outPortIds` is not empty).
 * - `buffered`: held here, e.g. an IPv4 packet waiting for ARP.
 * - `sent`: a PDU held earlier leaves the device now.
 * - `forwarded`: received and sent out of exactly one port (switched or routed; see `layer`).
 * - `flooded`: sent out of several ports (unknown unicast, broadcast, hub).
 * - `filtered`: received and deliberately not forwarded (bridge filtering; not an error).
 * - `delivered`: consumed here (cache update, upper layer, application).
 * - `replied`: consumed and answered; the answer has its own `created` event (`causeEventId`).
 * - `dropped`: discarded because of a problem (`reason` required).
 * - `timedOut`: no PDU; a client gave up waiting (`reason` required).
 */
export type SimAction =
  | 'created'
  | 'buffered'
  | 'sent'
  | 'forwarded'
  | 'flooded'
  | 'filtered'
  | 'delivered'
  | 'replied'
  | 'dropped'
  | 'timedOut'

export const SIM_ACTIONS: readonly SimAction[] = [
  'created',
  'buffered',
  'sent',
  'forwarded',
  'flooded',
  'filtered',
  'delivered',
  'replied',
  'dropped',
  'timedOut',
]

/** Actions that need a reason. */
export type ReasonedAction = Extract<SimAction, 'dropped' | 'timedOut'>

/** In: the PDU as it arrived and was taken apart; out: as it was built and sent (PT "In / Out Layers"). */
export type NoteDirection = 'in' | 'out'

/** One line of the OSI explanation in the inspector; message keys live in `simulation:notes.*`. */
export interface SimNote {
  readonly layer: OsiLayer
  readonly direction: NoteDirection
  readonly message: LocalizedMessage
}

/**
 * Identity of a PDU while it travels.
 * - `flowId`: the conversation it belongs to: a request id ('r3') for everything a request causes
 *   (the echo, its ARP, the reply, ICMP errors), 'boot' for start-up traffic, or 'bg:<deviceId>'.
 * - `pduId`: the logical packet ('p12'). Kept by switches and by routers (re-encapsulation keeps the
 *   IP packet); a reply or an ICMP error is a new PDU.
 * - `frameId`: one frame instance ('f40'). Flood copies share it; a router's re-encapsulation, a
 *   buffered packet sent later and every new PDU get a new one (the L2 loop guard keys on it).
 */
export interface PduIds {
  readonly flowId: string
  readonly pduId: string
  readonly frameId: string
}

/** One decision of one device about one PDU (or a PDU-less client event such as a timeout). */
export interface SimEvent {
  /** Unique, increasing in creation order (also the order inside one instant). */
  readonly id: number
  /** Virtual milliseconds since the engine was created. */
  readonly time: number
  /** Sequence number of the queued task that produced the event (events of one task share it). */
  readonly seq: number
  readonly deviceId: string
  /** Previous device on the wire (PT "Last Device"); absent for created PDUs. */
  readonly lastDeviceId?: string
  readonly inPortId?: string
  /** Arrival events: the `SimTransmission` whose frame arrived (the map ends that transmission here). */
  readonly transmissionId?: number
  /** Ports the PDU left from: one when forwarded, several when flooded, none when consumed or dropped. */
  readonly outPortIds: readonly string[]
  readonly flowId: string
  /** null for PDU-less events (timeouts, failures before a packet exists). */
  readonly pduId: string | null
  readonly frameId: string | null
  /** Top-most protocol of `inbound ?? outbound`, or the protocol of the client that timed out. */
  readonly protocol: SimProtocol | null
  readonly inbound: Pdu | null
  /** First frame sent (flood copies may differ in their 802.1Q tag: see the transmissions). */
  readonly outbound: Pdu | null
  readonly action: SimAction
  /** Highest layer the device handled the PDU at: 1 hub, 2 switch / ARP, 3 routing, 4 / 7 services. */
  readonly layer: OsiLayer
  readonly reason?: SimReason
  readonly notes: readonly SimNote[]
  /** The event this one answers or was triggered by (a reply → its request, an ARP → the buffered packet). */
  readonly causeEventId?: number
}

/** A frame on one link: what the map animation draws. */
export interface SimTransmission {
  readonly id: number
  /** The event that sent it. */
  readonly eventId: number
  readonly linkId: string
  readonly from: LinkEnd
  readonly to: LinkEnd
  readonly departAt: number
  readonly arriveAt: number
  readonly flowId: string
  readonly pduId: string
  readonly frameId: string
  readonly frame: WireFrame
  readonly protocol: SimProtocol
}
