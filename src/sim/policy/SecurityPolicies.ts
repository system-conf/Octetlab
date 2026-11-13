// The security chain in its fixed order (docs/SECURITY_PACK.md §5, docs/FIREWALL_PACK.md §2):
// firewall, then ACL, then NAT on ingress; egress runs in reverse. Only the coordinator edits this
// file; agents implement FirewallPolicy / AclPolicy / NatPolicy behind it.
import { AclPolicy } from './acl/AclPolicy'
import { FirewallPolicy } from './firewall/FirewallPolicy'
import { NatPolicy } from './nat/NatPolicy'
import { PacketPolicyChain } from './PacketPolicyChain'

export class SecurityPolicies {
  static create(): PacketPolicyChain {
    return new PacketPolicyChain([new FirewallPolicy(), new AclPolicy(), new NatPolicy()])
  }
}
