import type { LocalizedMessage } from '../../../domain/Messages'
import { SimMessages, type EventFilter, type EventListItem, type SimEvent, type SimProtocol } from '../simulationServices'
import { EventSummaries } from './EventSummaries'

/** Filter chips in the order learners meet the protocols. */
export const FILTER_PROTOCOLS: readonly SimProtocol[] = ['arp', 'icmp', 'dhcp', 'dns', 'http', 'telnet', 'ssh', 'tcp', 'udp', 'ipv4', 'ethernet', 'hdlc']

/** One row of the event list: the contract's item plus what the row shows under it. */
export interface EventRow extends EventListItem {
  /** Short description of the PDU (Wireshark "Info"). */
  readonly info: LocalizedMessage
  /** Drop / timeout reason, if any. */
  readonly reason: LocalizedMessage | null
}

/** Event-list filtering and rows (docs/SIMULATION.md §8). Filters never change the simulation. */
export class EventFilters {
  static all(): EventFilter {
    return { protocols: FILTER_PROTOCOLS }
  }

  static none(): EventFilter {
    return { protocols: [] }
  }

  static has(filter: EventFilter, protocol: SimProtocol): boolean {
    return filter.protocols.includes(protocol)
  }

  /** Adds or removes one protocol, keeping chip order. */
  static toggle(filter: EventFilter, protocol: SimProtocol): EventFilter {
    const on = new Set(filter.protocols)
    if (on.has(protocol)) on.delete(protocol)
    else on.add(protocol)
    return { ...filter, protocols: FILTER_PROTOCOLS.filter((candidate) => on.has(candidate)) }
  }

  /**
   * PDU-less events (a client that timed out without a protocol) are shown whenever any protocol is,
   * because they end a story the learner is following; an empty filter shows nothing.
   */
  static matches(filter: EventFilter, event: SimEvent): boolean {
    if (filter.flowIds && !filter.flowIds.includes(event.flowId)) return false
    if (event.protocol === null) return filter.protocols.length > 0
    return filter.protocols.includes(event.protocol)
  }

  static apply(filter: EventFilter, events: readonly SimEvent[]): SimEvent[] {
    return events.filter((event) => EventFilters.matches(filter, event))
  }

  static row(event: SimEvent): EventRow {
    return {
      eventId: event.id,
      time: event.time,
      ...(event.lastDeviceId !== undefined ? { lastDeviceId: event.lastDeviceId } : {}),
      deviceId: event.deviceId,
      protocol: event.protocol,
      action: event.action,
      flowId: event.flowId,
      summary: SimMessages.action(event.action),
      info: EventSummaries.of(event),
      reason: event.reason ? SimMessages.reason(event.reason) : null,
    }
  }
}
