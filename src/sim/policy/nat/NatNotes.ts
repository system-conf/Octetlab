// Inspector notes of NAT (`nat:notes.*`), checked against src/locales/en/nat.json at compile time.
import type { LocalizedMessage } from '../../../domain/Messages'
import { type AppMessageKey, localizedMessage } from '../../../i18n/messageKeys'
import type { NatEndpoint } from '../../contract/SecurityRuntime'

/** Every key under `nat:notes`. */
export type NatNoteKey = AppMessageKey extends infer Key ? (Key extends `nat:notes.${infer Name}` ? Name : never) : never

export class NatNotes {
  static of(key: NatNoteKey, params?: Record<string, string | number>): LocalizedMessage {
    return localizedMessage(`nat:notes.${key}`, params)
  }

  /** '192.168.1.10:1024' or '192.168.1.10'. */
  static endpoint(endpoint: NatEndpoint): string {
    return endpoint.port === undefined ? endpoint.ip : `${endpoint.ip}:${endpoint.port}`
  }
}
