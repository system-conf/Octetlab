// Pack 5.2 exercises written as v2 data (no v1 migration): ACL and NAT. SSH has no exercise yet: no solve
// condition can observe a remote login (docs/SECURITY_PACK.md §10); its lesson is the SSH sample lab.
// Firewall pack exercises (docs/FIREWALL_PACK.md §10): stateful policy, publishing a DMZ server, levels.
import type { ExerciseDefinition } from '../../domain'
import { cafeGuestWifi } from './cafeGuestWifi'
import { clinicFirewallLevel } from './clinicFirewallLevel'
import { dmzWebsite } from './dmzWebsite'
import { mallShopFirewall } from './mallShopFirewall'
import { officeSharedIp } from './officeSharedIp'

export const securityExercises: readonly ExerciseDefinition[] = [cafeGuestWifi, officeSharedIp, mallShopFirewall, dmzWebsite, clinicFirewallLevel]
