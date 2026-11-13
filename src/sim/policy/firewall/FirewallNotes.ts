// Inspector notes of the stateful firewall (`firewall:notes.*`), checked against
// src/locales/en/firewall.json at compile time.
import type { LocalizedMessage } from '../../../domain/Messages'
import { type AppMessageKey, localizedMessage } from '../../../i18n/messageKeys'
import type { FirewallConnection } from '../../contract/FirewallRuntime'
import type { FirewallInterface } from './FirewallConfig'
import { FirewallFlows } from './FirewallFlows'

/** Every key under `firewall:notes`. */
export type FirewallNoteKey = AppMessageKey extends infer Key ? (Key extends `firewall:notes.${infer Name}` ? Name : never) : never

/** Every key under `acl:notes` (the firewall reuses the ACL texts for its access-group checks). */
export type AclNoteKey = AppMessageKey extends infer Key ? (Key extends `acl:notes.${infer Name}` ? Name : never) : never

export class FirewallNotes {
  static acl(key: AclNoteKey, params: Record<string, string | number>): LocalizedMessage {
    return localizedMessage(`acl:notes.${key}`, params)
  }

  static of(key: FirewallNoteKey, params?: Record<string, string | number>): LocalizedMessage {
    return localizedMessage(`firewall:notes.${key}`, params)
  }

  /** id, protocol, initiator and responder of an entry. */
  static connection(connection: FirewallConnection): Record<string, string | number> {
    return {
      id: connection.id,
      protocol: connection.protocol.toUpperCase(),
      initiator: FirewallFlows.endpoint(connection.initiator),
      responder: FirewallFlows.endpoint(connection.responder),
    }
  }

  /** from / to names and levels of a pair of interfaces. */
  static pair(ingress: FirewallInterface, exit: FirewallInterface): Record<string, string | number> {
    return { from: ingress.nameif, fromLevel: ingress.level, to: exit.nameif, toLevel: exit.level, level: ingress.level }
  }
}
