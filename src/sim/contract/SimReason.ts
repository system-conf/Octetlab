// Typed decision / drop codes of simulation events (docs/SIMULATION.md §3). Every code has the message
// `simulation:reasons.<code>` (checked at compile time by SimMessages.reason). Codes that mean the same
// as an engine FailureReason use the same name, so the oracle (O3) can compare them directly.

export const SIM_REASONS = [
  // ---- layer 1 / kernel
  /** The link stopped carrying traffic (unplugged, far end off or shut) before or while the frame travelled. */
  'linkDown',
  /** No cable on the port the frame should leave from. */
  'noLink',
  'powerOff',

  // ---- layer 2 (S1)
  /** Destination MAC is neither this NIC's, broadcast nor a multicast the device listens to. */
  'notForThisInterface',
  /** Bridge filtering: the destination MAC was learned on the ingress port (not an error). */
  'sameSegment',
  /** Tagged frame on an access port, or a VLAN the trunk does not allow. */
  'vlanNotAllowed',
  /** VLAN missing from the VLAN database (IOS: inactive). */
  'vlanInactive',
  /** Tagged frame on a routed port without a sub-interface for that VLAN. */
  'noSubInterface',
  /** A copy of a frame came back to a bridge it already passed (no STP yet: storm guard). */
  'l2Loop',
  /** ARP got no answer: the packets waiting for it are dropped. */
  'arpTimeout',
  /** The unresolved next hop already holds SIM_LIMITS.arpPendingPerNextHop packets: the new one is dropped (silently: no ICMP error). */
  'arpQueueFull',
  /** ARP request for an address this interface does not own (or cannot use). */
  'arpNotForUs',
  /** Wi-Fi client on an SSID the radio does not offer. */
  'unknownSsid',
  /** The provider line of the cloud port is down (link light stays on, MODEL_V2 §5). */
  'ispServiceDown',
  /** Only routed ports get internet service; an end device cabled to the cloud gets none. */
  'ispNoService',
  /** No other port carries the frame's VLAN (or has a working link): the frame goes nowhere. */
  'noEgressPort',
  /** The cloud answers only the MAC that asked: a packet without a link-layer destination is not sent. */
  'noDestinationMac',

  // ---- layer 3 (S2); names shared with FailureReason where the meaning is the same
  'cableDisconnected',
  'portDisabled',
  'noIpAddress',
  'invalidConfig',
  'invalidHostAddress',
  'ipConflict',
  'gatewayNotSet',
  'gatewayOutsideSubnet',
  'ttlExpired',
  /** No route for the destination. */
  'noRoute',
  /** IP packet for another address arrived at a device that does not route (host, L2 switch). */
  'notRouting',
  /** Lab rule: a router never sends private / special-purpose destinations to the internet cloud. */
  'privateToInternet',
  /** The internet cloud has no route for a non-public destination. */
  'ispNoRoute',
  /** UDP / TCP port without a listener (ICMP port unreachable / TCP RST follows). */
  'portUnreachable',
  /** IP payload the device does not handle. */
  'protocolUnreachable',
  /** ICMP errors are never sent about ICMP errors or broadcasts (RFC 1122). */
  'noIcmpAboutIcmpError',

  // ---- services (S3)
  'dhcpServiceDisabled',
  /** No pool for the subnet of the receiving (or relay) interface. */
  'dhcpNoPool',
  'dhcpPoolExhausted',
  /** DHCP reply for another client (transaction id or MAC differ). */
  'dhcpNotForThisClient',
  /** The server refused the request (DHCPNAK). */
  'dhcpNak',
  'dnsServiceDisabled',
  /** The query is already being forwarded by this server (forwarder loop). */
  'dnsLoop',
  /** The internet resolver received a query on an address that runs no DNS. */
  'dnsNotAResolver',
  /** TCP connection refused (RST). */
  'connectionRefused',

  // ---- security pack 5.2 (docs/SECURITY_PACK.md)
  /** An access list on the interface (in or out) denied the packet; ICMP admin-prohibited follows. */
  'aclDenied',
  /** NAT had no free inside-global address / port for the packet (ICMP host unreachable follows). */
  'natPoolExhausted',
  /** A packet to an outside address has no translation and matches no static rule. */
  'natNoTranslation',
  /** The vty `access-class` refused the remote session. */
  'vtyAccessDenied',
  /** Remote login failed: wrong user / password, or `login` without a password. */
  'remoteLoginFailed',
  /** SSH asked of a device without RSA keys, or the transport input does not allow the protocol. */
  'remoteAccessDisabled',

  // ---- firewall pack (docs/FIREWALL_PACK.md)
  /** From a lower security level to a higher one without an access list permitting it. */
  'firewallDenied',
  /** A TCP segment other than SYN (or a reply) with no tracked connection. */
  'firewallNoConnection',
  /** Between two interfaces of the same security level without `same-security-traffic`. */
  'firewallSameLevel',
  /** In or out through an interface without a `nameif` (lab rule). */
  'firewallNoNameif',

  // ---- clients
  /** A client gave up waiting for an answer (ping, tracert, DHCP, DNS, HTTP). */
  'requestTimedOut',
  /** An answer to a request or sequence number the client no longer waits for. */
  'staleReply',
  /** A PDU this device does not process. */
  'unsupported',
] as const

export type SimReason = (typeof SIM_REASONS)[number]
