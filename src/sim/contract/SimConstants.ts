// Fixed numbers of the simulator (docs/SIMULATION.md §3.4, §4). Virtual milliseconds unless named
// otherwise. Chosen for engine parity and readable timelines; real defaults are noted where they differ.

export const SIM_TIMING = {
  /** Copper, fiber and coaxial links. Device processing takes no virtual time. */
  wiredLinkMs: 1,
  wirelessLinkMs: 2,
  serialLinkMs: 2,
  /** ARP: a request every arpRetryMs, arpAttempts times, then the waiting packets are dropped (3 s < ping timeout). */
  arpRetryMs: 1000,
  arpAttempts: 3,
  /** Lab values (Windows: 15–45 s reachable time; IOS: 4 h). */
  arpAgeHostMs: 120_000,
  arpAgeRouterMs: 14_400_000,
  /** IOS default 300 s. */
  macAgeMs: 300_000,
  /** Windows ping / tracert defaults. */
  echoTimeoutMs: 4000,
  echoIntervalMs: 1000,
  /** nslookup default per server. */
  dnsTimeoutMs: 2000,
  /** A DNS server waits this long per forwarder, so several forwarders fit into one client timeout. */
  dnsForwardTimeoutMs: 500,
  /** TTL of the answers of the internet's resolvers. */
  dnsAnswerTtlSeconds: 300,
  /** Lab values (Windows: 4, 8, 16, 32 s); 3 tries then "renew timed out". */
  dhcpRetransmitMs: 2000,
  dhcpAttempts: 3,
  dhcpLeaseSeconds: 86_400,
  httpTimeoutMs: 5000,
  /** A bridge forgets a forwarded frame id after this long (L2 loop guard). */
  seenFrameMs: 1000,
} as const

export const SIM_TTL = {
  /** Windows. */
  host: 128,
  /** IOS. */
  router: 255,
  /** Internet hosts answer with 118 (128 minus ten fictional ISP hops): 117 behind one customer router, as the engine prints. */
  internetReply: 118,
} as const

export const SIM_PORTS = {
  dns: 53,
  dhcpServer: 67,
  dhcpClient: 68,
  http: 80,
  /** Pack 5.2 remote access (vty). */
  ssh: 22,
  telnet: 23,
  /** First ephemeral port (Windows). */
  ephemeralStart: 49152,
} as const

export const SIM_LIMITS = {
  /** Default task limit of runUntilIdle / runUntil / runUntilDone. */
  taskLimit: 100_000,
  maxRetainedEvents: 50_000,
  /**
   * Budget of the start-up traffic `create` runs (`settle`): at most this many tasks, and only tasks up
   * to this virtual time. Past it the engine stops settling, keeps the rest queued and reports
   * `settleTruncated`. A flat segment of n hosts needs about n² tasks (every probe reaches every
   * host): ~240 000 at 500 devices, ~375 000 at 625, a few µs each.
   */
  settleTaskLimit: 400_000,
  settleTimeMs: 60_000,
  /**
   * IPv4 packets one unresolved next hop holds while ARP runs (real stacks keep a few: IOS one, Linux a
   * small queue). A further packet is dropped ('arpQueueFull'), silently: its sender times out.
   */
  arpPendingPerNextHop: 4,
  /**
   * Echo results a ping keeps in its record and session (the latest ones); `PingResult.stats` counts all
   * of them. At least the terminal's PingOptions.maxCount, so terminal output always sees every echo.
   */
  echoResultsKept: 100,
} as const
