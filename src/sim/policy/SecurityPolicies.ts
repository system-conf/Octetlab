// The pack 5.2 chain in its fixed IOS order (docs/SECURITY_PACK.md §5). Only the coordinator edits
// this file; agents A and B implement AclPolicy / NatPolicy behind it.
import { AclPolicy } from './acl/AclPolicy'
import { NatPolicy } from './nat/NatPolicy'
import { PacketPolicyChain } from './PacketPolicyChain'

export class SecurityPolicies {
  static create(): PacketPolicyChain {
    return new PacketPolicyChain([new AclPolicy(), new NatPolicy()])
  }
}
