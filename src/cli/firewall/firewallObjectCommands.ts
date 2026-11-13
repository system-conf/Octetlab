// Network objects (docs/FIREWALL_PACK.md §6.1–6.3):
//   object network <name>            → Firewall(config-network-object)#  (creates the object)
//   no object network <name>         → deletes it and the NAT rows it produced
//   host <ip> | subnet <ip> <mask>   → the object's address (sub-mode)
//   nat (<real>,<mapped>) dynamic interface | dynamic <ip> | static <ip>   (+ `no nat`)
// The object is stored in FirewallSettings.objects; its NAT line is mapped onto the pack 5.2 NAT data by
// ObjectNatMapper after every change (withdraw the old rows, apply the new ones).
import type { FirewallNetworkObject, FirewallObjectNat } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { FirewallEdits } from './FirewallEdits'
import { FIREWALL_ERRORS, isFirewall } from './firewallMessages'
import { ObjectNatMapper } from './ObjectNatMapper'

const OBJECT_NAME = /^[A-Za-z_][\w.-]{0,63}$/
const INTERFACE_PAIR = /^\(([^,()\s]+),([^,()\s]+)\)$/

function currentName(ctx: CliContext): string {
  if (ctx.mode.kind !== 'objectNetwork') throw new Error('Object command outside the network object mode')
  return ctx.mode.name
}

/** Withdraws the object's old NAT rows, stores the changed object and applies its NAT again. */
function changeObject(ctx: CliContext, change: (object: FirewallNetworkObject) => FirewallNetworkObject): CliCommandResult {
  const name = currentName(ctx)
  const before = FirewallEdits.findObject(ctx.device, name) ?? { name }
  const after = change(before)
  const stored = FirewallEdits.putObject(ObjectNatMapper.withdraw(ctx.device, before), after)
  const result = ObjectNatMapper.apply(stored, after)
  return result.ok ? { device: result.device } : { lines: cliError(result.error) }
}

function enterObject(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('object')
  if (!OBJECT_NAME.test(name)) return { lines: cliError(FIREWALL_ERRORS.badObjectName(name)) }
  const device = FirewallEdits.findObject(ctx.device, name) === undefined ? FirewallEdits.putObject(ctx.device, { name }) : ctx.device
  return { device, mode: { kind: 'objectNetwork', name } }
}

function deleteObject(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('object')
  const object = FirewallEdits.findObject(ctx.device, name)
  if (object === undefined) return { lines: cliError(FIREWALL_ERRORS.noSuchObject(name)) }
  return { device: FirewallEdits.removeObject(ObjectNatMapper.withdraw(ctx.device, object), name) }
}

function withoutKey<Key extends 'address' | 'nat'>(object: FirewallNetworkObject, key: Key): FirewallNetworkObject {
  const copy = { ...object }
  delete copy[key]
  return copy
}

function setHost(ctx: CliContext): CliCommandResult {
  return changeObject(ctx, (object) => ({ ...object, address: { kind: 'host', address: ctx.args.text('host') } }))
}

function setSubnet(ctx: CliContext): CliCommandResult {
  const address = ctx.args.text('address')
  const mask = ctx.args.text('mask')
  if (mask !== '0.0.0.0' && !Ipv4.isValidMask(mask)) return { lines: cliError(FIREWALL_ERRORS.badMask(mask)) }
  // Appliances refuse host bits in a subnet (lab text; real wording UNVERIFIED).
  if (mask !== '0.0.0.0' && Ipv4.network(address, mask) !== Ipv4.parse(address)) return { lines: cliError(FIREWALL_ERRORS.addressMaskPair(address, mask)) }
  if (mask === '0.0.0.0' && address !== '0.0.0.0') return { lines: cliError(FIREWALL_ERRORS.addressMaskPair(address, mask)) }
  return changeObject(ctx, (object) => ({ ...object, address: { kind: 'subnet', address, mask } }))
}

function setNat(ctx: CliContext, type: FirewallObjectNat['type'], mapped: FirewallObjectNat['mapped']): CliCommandResult {
  const pair = INTERFACE_PAIR.exec(ctx.args.text('pair'))
  if (pair === null || pair[1] === undefined || pair[2] === undefined) return { lines: cliError(FIREWALL_ERRORS.natInterfacePair) }
  const nat: FirewallObjectNat = { realInterface: pair[1], mappedInterface: pair[2], type, mapped }
  return changeObject(ctx, (object) => ({ ...object, nat }))
}

function clearNat(ctx: CliContext): CliCommandResult {
  return changeObject(ctx, (object) => withoutKey(object, 'nat'))
}

function clearAddress(ctx: CliContext): CliCommandResult {
  return changeObject(ctx, (object) => withoutKey(object, 'address'))
}

const mappedAddress = (type: FirewallObjectNat['type']): CliNode =>
  param('mapped', { type: 'ipv4' }, 'Mapped IP address', {
    run: (ctx) => setNat(ctx, type, { kind: 'address', address: ctx.args.text('mapped') }),
    runNo: clearNat,
  })

const natNode = keyword('nat', 'Enable NAT on a singleton object', {
  runNo: clearNat,
  children: [
    param('pair', { type: 'word', label: '(real_ifc,mapped_ifc)' }, 'Real and mapped interface names', {
      runNo: clearNat,
      children: [
        keyword('dynamic', 'Configure dynamic NAT (address translation with port)', {
          runNo: clearNat,
          children: [keyword('interface', 'Use the mapped interface address', { run: (ctx) => setNat(ctx, 'dynamic', { kind: 'interface' }), runNo: clearNat }), mappedAddress('dynamic')],
        }),
        keyword('static', 'Configure static NAT', { runNo: clearNat, children: [mappedAddress('static')] }),
      ],
    }),
  ],
})

const subModeNodes: readonly CliNode[] = [
  keyword('host', 'Enter an IP address', { runNo: clearAddress, children: [param('host', { type: 'ipv4' }, 'IP address', { run: setHost, runNo: clearAddress })] }),
  natNode,
  keyword('subnet', 'Enter a network and netmask', {
    runNo: clearAddress,
    children: [param('address', { type: 'ipv4' }, 'Network address', { runNo: clearAddress, children: [param('mask', { type: 'ipv4' }, 'Netmask', { run: setSubnet, runNo: clearAddress })] })],
  }),
]

export const firewallObjectCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('object', 'Configure an object', {
      when: isFirewall,
      children: [
        keyword('network', 'Configure a network object', {
          children: [param('object', { type: 'word', label: 'WORD' }, 'Object name', { run: enterObject, runNo: deleteObject })],
        }),
      ],
    }),
  },
  ...subModeNodes.flatMap((node): CliCommandRegistration[] => (node.kind === 'keyword' ? [{ modes: ['objectNetwork'], node: { ...node, when: isFirewall } }] : [])),
]
