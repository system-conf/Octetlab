// The firewall slots of a device's runtime (docs/FIREWALL_PACK.md §5). Prelude stub: agent A owns
// this file and implements read / write / expiry like NatRuntime; `clear` is wired to `clear conn`.
import type { DeviceContext, DeviceRuntime } from '../../contract'
import type { FirewallConnection } from '../../contract/FirewallRuntime'

export class FirewallRuntime {
  /** Connections stored in `runtime`, without the expiry sweep. */
  static stored(runtime: DeviceRuntime | undefined): readonly FirewallConnection[] {
    return runtime?.extensions?.firewallConnections ?? []
  }

  /** `clear conn`: removes every tracked connection; returns how many were removed. */
  static clear(ctx: DeviceContext): number {
    const removed = FirewallRuntime.stored(ctx.runtime).length
    if (removed > 0) {
      ctx.updateRuntime((runtime) => ({ ...runtime, extensions: { ...runtime.extensions, firewallConnections: [] } }))
    }
    return removed
  }
}
