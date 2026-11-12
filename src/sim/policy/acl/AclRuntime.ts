// ACL hit counters in the device runtime (pack 5.2, docs/SECURITY_PACK.md §5): extensions.aclCounters,
// list name → sequence number → matches since the last `clear access-list counters`. Immutable updates.
import type { DeviceContext, DeviceRuntime } from '../../contract'

function withoutCounters(runtime: DeviceRuntime): DeviceRuntime {
  const { extensions, ...rest } = runtime
  const { aclCounters, ...others } = extensions ?? {}
  void aclCounters
  return Object.keys(others).length === 0 ? rest : { ...rest, extensions: others }
}

export class AclRuntime {
  /** One more match of entry `seq` of list `name`. */
  static count(ctx: DeviceContext, name: string, seq: number): void {
    ctx.updateRuntime((runtime) => {
      const counters = runtime.extensions?.aclCounters ?? {}
      const own = counters[name] ?? {}
      const aclCounters = { ...counters, [name]: { ...own, [seq]: (own[seq] ?? 0) + 1 } }
      return { ...runtime, extensions: { ...runtime.extensions, aclCounters } }
    })
  }

  /** `clear access-list counters`: resets every counter; returns how many entry counters were reset. */
  static clear(ctx: DeviceContext): number {
    const counters = ctx.runtime.extensions?.aclCounters ?? {}
    const reset = Object.values(counters).reduce((sum, list) => sum + Object.keys(list).length, 0)
    if (ctx.runtime.extensions?.aclCounters !== undefined) ctx.updateRuntime(withoutCounters)
    return reset
  }
}
