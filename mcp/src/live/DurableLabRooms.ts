// LabRooms on the LAB_ROOMS Durable Object namespace: one LabRoom per lab id (idFromName), reached by
// RPC; WebSocket upgrades are forwarded with the stub's fetch.
import type { DurableObjectNamespaceBinding, LabRoomStub } from '../platform/WorkerBindings'
import type { LabRoomClient, LabRooms } from './LabRooms'

export class DurableLabRooms implements LabRooms {
  private readonly namespace: DurableObjectNamespaceBinding<LabRoomStub>

  constructor(namespace: DurableObjectNamespaceBinding<LabRoomStub>) {
    this.namespace = namespace
  }

  room(labId: string): LabRoomClient {
    return this.stub(labId)
  }

  connect(labId: string, request: Request): Promise<Response> {
    return this.stub(labId).fetch(request)
  }

  private stub(labId: string): LabRoomStub {
    return this.namespace.get(this.namespace.idFromName(labId))
  }
}
