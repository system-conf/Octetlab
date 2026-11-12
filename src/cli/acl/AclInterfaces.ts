// The layer-3 settings behind a CLI interface (routed port, sub-interface, SVI), for the ACL bindings.
import type { L3Settings } from '../../domain'
import type { CliInterface } from '../contract'

export class AclInterfaces {
  /** undefined for switchports (no layer-3 settings). */
  static l3Of(iface: CliInterface): L3Settings | undefined {
    switch (iface.kind) {
      case 'port':
        return iface.port.role === 'routed' ? iface.port.l3 : undefined
      case 'subInterface':
        return iface.sub.l3
      case 'svi':
        return iface.svi.l3
    }
  }
}
