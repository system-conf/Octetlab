// IOS error texts of the NAT commands (device output: English, like every IOS message in the CLI).
// Seen in IOS output: "%Start and end addresses on different subnets", "%End address less than starting
// address", "% similar static entry (a -> b) already exists", "%Pool X in use, cannot destroy".
// UNVERIFIED (closest IOS style chosen): badPoolName, badMask, badInterface, poolNotFound,
// mappingNotFound, translationNotFound.
export const NAT_ERRORS = {
  badPoolName: '% Invalid pool name',
  badMask: '%Invalid netmask',
  endBeforeStart: '%End address less than starting address',
  differentSubnets: '%Start and end addresses on different subnets',
  badInterface: '%Invalid interface type and number',
  mappingNotFound: '%Dynamic mapping not found',
  translationNotFound: '%Translation not found',
  poolNotFound: (name: string): string => `%Pool ${name} not found`,
  poolInUse: (name: string): string => `%Pool ${name} in use, cannot destroy`,
  similarStatic: (local: string, global: string): string => `% similar static entry (${local} -> ${global}) already exists`,
} as const
