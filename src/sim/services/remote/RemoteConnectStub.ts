// Prelude stub of the pack 5.2 remote-access client (docs/SECURITY_PACK.md §6). Agent C replaces the
// body with the real TCP 22 / 23 exchange; until then a request ends at once as unsupported, so no
// caller waits forever.
import type { DeviceContext, SimRemoteConnectRequest } from '../../contract'

export class RemoteConnectStub {
  static start(ctx: DeviceContext, requestId: string, request: SimRemoteConnectRequest): void {
    ctx.report(
      requestId,
      { kind: 'remoteConnect', protocol: request.protocol, targetIp: request.targetIp, outcome: { ok: false, failure: 'localFailure', reason: 'unsupported' } },
      true,
    )
  }
}
