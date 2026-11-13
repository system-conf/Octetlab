// Firewall pack cross-feature checks (docs/FIREWALL_PACK.md §2 D6 / D11, §10 D): firewall, ACL and NAT on
// one device follow the documented order, and a lab with every kind of firewall data survives the lab file
// and the share link.
import { describe, expect, it } from 'vitest'
import { StateInvariants, type AccessList, type NetworkState, type SolveCondition } from '../../domain'
import { LabSerializer } from '../../lab/LabSerializer'
import { LabShareLink } from '../../lab/LabShareLink'
import { openSampleLab } from '../../samples/contract'
import { securityFirewallOffice } from '../../samples/content/firewallSamples'
import { SimSolveChecker } from '../../sim'
import { dmzWebsite, PUBLISHED_ADDRESS } from './dmzWebsite'
import { natWithoutException, publishWebServer } from './firewallFixes'
import { firewallSettings, webException } from './firewallSetup'
import { editDevice } from './securityFixes'
import { ANY, accessGroup, accessLists } from './securitySetup'

function holds(state: NetworkState, ...conditions: SolveCondition[]): boolean[] {
  return SimSolveChecker.check(state, conditions).map((result) => result.ok)
}

const siteOpens: SolveCondition = { type: 'appLinksOk', deviceId: 'musteriLaptop' }
const toServer = (fromDeviceId: string): SolveCondition => ({ type: 'reachable', fromDeviceId, toDeviceId: 'webSunucu' })

/** Extended list: deny ip host <source> any, then permit ip any any. */
function denyHost(name: string, source: string): AccessList {
  return {
    name,
    type: 'extended',
    entries: [
      { seq: 10, kind: 'extended', action: 'deny', protocol: 'ip', source: { address: source, wildcard: '0.0.0.0' }, destination: ANY },
      { seq: 20, kind: 'extended', action: 'permit', protocol: 'ip', source: ANY, destination: ANY },
    ],
  }
}

describe('firewall, ACL and NAT on one device: order of checks', () => {
  const office = dmzWebsite.lab.state

  it('D6: the outside exception names the real address and lets the published server in', () => {
    expect(holds(publishWebServer(office), siteOpens)).toEqual([true])
  })

  it('D6: an exception that names the mapped (public) address matches nothing', () => {
    const state = editDevice(natWithoutException(office), 'firewall', accessLists([webException(PUBLISHED_ADDRESS)]), accessGroup('Gi0/0', 'OUTSIDE_IN', 'in'))
    expect(holds(state, siteOpens)).toEqual([false])
  })

  it('without an exception the level rule drops outside → dmz before NAT can help', () => {
    expect(holds(natWithoutException(office), siteOpens)).toEqual([false])
  })

  it('an inbound list on the higher-level interface can still deny what the levels allow', () => {
    const state = editDevice(office, 'firewall', accessLists([denyHost('NO_SECRETARY', '192.168.1.11')]), accessGroup('Gi0/1', 'NO_SECRETARY', 'in'))
    expect(holds(state, toServer('mimarPc'), toServer('sekreterPc'))).toEqual([true, false])
  })
})

/** The firewall sample plus every kind of firewall pack data on FW1. */
function fullFirewallLab() {
  const doc = openSampleLab(securityFirewallOffice, { title: 'firewall pack' })
  const state = editDevice(
    doc.state,
    'fw1',
    firewallSettings({
      sameSecurityInterInterface: true,
      sameSecurityIntraInterface: false,
      inspectIcmp: false,
      timeouts: { tcp: 1800, halfClosed: 300, udp: 60, icmp: 5 },
    }),
  )
  return { ...doc, state }
}

describe('a lab with firewall + ACL + NAT data', () => {
  const doc = fullFirewallLab()

  it('is a valid lab and carries the firewall data', () => {
    expect(new StateInvariants().violations(doc.state)).toEqual([])
    const firewall = doc.state.devices.find((device) => device.id === 'fw1')
    expect(firewall?.kind).toBe('firewall')
    expect(firewall?.features?.firewall?.objects?.map((object) => object.name)).toEqual(['INSIDE_NET', 'WEB_SERVER'])
  })

  it('round-trips through the lab file unchanged', () => {
    const serializer = new LabSerializer()
    for (const text of [serializer.serialize(doc), serializer.serializeCompact(doc)]) {
      const parsed = serializer.parse(JSON.parse(text))
      expect(parsed.ok && parsed.doc).toEqual(doc)
    }
  })

  it('round-trips through the share link unchanged', () => {
    const shareLink = new LabShareLink()
    const encoded = shareLink.encode(doc)
    if (!encoded.ok) throw new Error('expected a share hash')
    const decoded = shareLink.decode(encoded.hash)
    expect(decoded?.ok && decoded.doc).toEqual(doc)
  })
})
