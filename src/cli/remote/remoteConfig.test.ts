import { describe, expect, it } from 'vitest'
import { CLI_COMMAND_SETS } from '../commandSets'
import { CliShell } from '../core/CliShell'
import { FactoryReset } from '../core/FactoryReset'
import { RemoteCli } from './testRemoteCli'

function cli(): RemoteCli {
  return new RemoteCli()
}

const SSH_SETUP = [
  'hostname R1',
  'ip domain-name lab.local',
  'username admin privilege 15 secret cisco123',
  'username guest password guestpw',
  'ip ssh version 2',
  'ip ssh time-out 60',
  'ip ssh authentication-retries 2',
  'line vty 0 4',
  'login local',
  'transport input ssh',
  'exit',
]

describe('remote access CLI: RSA keys', () => {
  it('needs a hostname other than the factory one and a domain name', () => {
    const driver = cli()
    expect(driver.configure('crypto key generate rsa')).toEqual(['% Please define a hostname other than Router.'])
    driver.type('hostname R1')
    expect(driver.type('crypto key generate rsa general-keys modulus 1024')).toEqual(['% Please define a domain-name first.'])
    expect(driver.device.features?.management?.ssh).toBeUndefined()
  })

  it('generates keys non-interactively (MCP form) and enables SSH 1.99', () => {
    const driver = cli()
    driver.configure('hostname R1', 'ip domain name lab.local')
    expect(driver.type('crypto key generate rsa general-keys modulus 2048')).toEqual([
      'The name for the keys will be: R1.lab.local',
      '% The key modulus size is 2048 bits',
      '% Generating 2048 bit RSA keys, keys will be non-exportable...',
      '[OK] (elapsed time was 2 seconds)',
      '',
      '%SSH-5-ENABLED: SSH 1.99 has been enabled',
    ])
    expect(driver.last.input).toBe('command')
    expect(driver.device.features?.management?.ssh).toEqual({ rsaKeyBits: 2048 })
  })

  it('asks the modulus interactively; Enter takes 512, a bad size asks again', () => {
    const driver = cli()
    driver.configure('hostname R1', 'ip domain-name lab.local')
    expect(driver.type('crypto key generate rsa')).toEqual([
      'The name for the keys will be: R1.lab.local',
      'Choose the size of the key modulus in the range of 360 to 4096 for your',
      '  General Purpose Keys. Choosing a key modulus greater than 512 may take',
      '  a few minutes.',
      '',
    ])
    expect(driver.prompt).toBe('How many bits in the modulus [512]: ')
    driver.type('100')
    expect(driver.prompt).toBe('How many bits in the modulus [512]: ')
    expect(driver.type('')).toContain('% Generating 512 bit RSA keys, keys will be non-exportable...')
    expect(driver.device.features?.management?.ssh?.rsaKeyBits).toBe(512)
  })

  it('replaces keys only after yes, and zeroizes them after yes', () => {
    const driver = cli()
    driver.configure('hostname R1', 'ip domain-name lab.local', 'crypto key generate rsa modulus 1024')
    expect(driver.type('crypto key generate rsa modulus 2048')).toEqual(['% You already have RSA keys defined named R1.lab.local.'])
    driver.type('')
    expect(driver.device.features?.management?.ssh?.rsaKeyBits).toBe(1024)
    driver.type('crypto key generate rsa modulus 2048')
    driver.type('yes')
    expect(driver.device.features?.management?.ssh?.rsaKeyBits).toBe(2048)
    driver.type('crypto key zeroize rsa')
    expect(driver.prompt).toBe('Do you really want to remove these keys? [yes/no]: ')
    expect(driver.type('yes')).toEqual(['%SSH-5-DISABLED: SSH 1.99 has been disabled'])
    expect(driver.device.features?.management?.ssh).toBeUndefined()
  })

  it('keeps the keys over reload (not in running-config)', () => {
    const driver = cli()
    driver.configure(...SSH_SETUP, 'crypto key generate rsa modulus 1024', 'end')
    driver.typeAll('copy running-config startup-config', '')
    const reloaded = driver.shell.reload(driver.device)
    expect(reloaded.features?.management?.ssh).toEqual({ rsaKeyBits: 1024, version: 2, timeoutSeconds: 60, authRetries: 2 })
    expect(FactoryReset.of(driver.device).features?.management?.ssh).toEqual({ rsaKeyBits: 1024 })
  })
})

describe('remote access CLI: configuration', () => {
  it('writes running-config like IOS and replays it to the same settings', () => {
    const driver = cli()
    driver.configure(...SSH_SETUP, 'crypto key generate rsa modulus 1024', 'line vty 0 4', 'password vtypw', 'end')
    const config = driver.config()
    expect(config).toContain('ip domain-name lab.local')
    const userLines = config.filter((line) => line.startsWith('username'))
    expect(userLines[0]).toMatch(/^username admin privilege 15 secret 5 \$1\$\S+$/)
    expect(userLines[1]).toBe('username guest password 0 guestpw')
    expect(config.join('\n')).not.toContain('cisco123')
    const ssh = config.indexOf('ip ssh time-out 60')
    expect(config.slice(ssh, ssh + 3)).toEqual(['ip ssh time-out 60', 'ip ssh authentication-retries 2', 'ip ssh version 2'])
    const vty = config.indexOf('line vty 0 4')
    expect(config.slice(vty, vty + 4)).toEqual(['line vty 0 4', ' password vtypw', ' login local', ' transport input ssh'])
    const replayed = driver.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(driver.device)), config.join('\n'))
    expect(replayed.features?.management?.users).toEqual(driver.device.features?.management?.users)
    expect(replayed.features?.management?.lines).toEqual(driver.device.features?.management?.lines)
    expect(driver.shell.runningConfig(replayed)).toEqual(config)
  })

  it('shows passwords as type 7 with service password-encryption and reads them back', () => {
    const driver = cli()
    driver.configure('service password-encryption', 'username guest password guestpw')
    const line = driver.config().find((entry) => entry.startsWith('username')) ?? ''
    expect(line).toMatch(/^username guest password 7 [0-9A-F]+$/)
    const replayed = driver.shell.replay(FactoryReset.of(driver.device), line)
    expect(replayed.features?.management?.users).toEqual([{ name: 'guest', password: 'guestpw' }])
  })

  it('keeps one login method on the line and maps transport input', () => {
    const driver = cli()
    driver.configure('line vty 0 4', 'login local')
    expect(driver.device.features?.management?.lines?.vty).toEqual({ loginLocal: true })
    driver.type('login')
    expect(driver.device.features?.management?.lines).toBeUndefined()
    driver.typeAll('login local', 'no login local', 'transport input telnet ssh')
    expect(driver.device.features?.management?.lines?.vty).toEqual({ transportInput: ['ssh', 'telnet'] })
    expect(driver.config()).toContain(' transport input telnet ssh')
    driver.type('transport input none')
    expect(driver.config()).toContain(' transport input none')
    driver.type('transport input all')
    expect(driver.device.features?.management?.lines).toBeUndefined()
    driver.typeAll('exit', 'line console 0')
    expect(driver.type('transport input ssh')).toEqual(['{remoteAccess:cli.vtyOnly}'])
  })

  it('removes users and settings with no', () => {
    const driver = cli()
    driver.configure(...SSH_SETUP, 'no username guest', 'no ip ssh version', 'no ip domain-name', 'no ip ssh time-out', 'no ip ssh authentication-retries')
    expect(driver.device.features?.management?.users).toEqual([{ name: 'admin', secret: 'cisco123', privilege: 15 }])
    expect(driver.device.features?.management?.ssh).toBeUndefined()
    expect(driver.device.features?.management?.domainName).toBeUndefined()
  })

  it('merges with every pack command set', () => {
    expect(() => new CliShell(CLI_COMMAND_SETS)).not.toThrow()
  })
})

describe('remote access CLI: show', () => {
  it('show ip ssh: disabled without keys, enabled with them (golden)', () => {
    const driver = cli()
    driver.type('enable')
    expect(driver.type('show ip ssh')).toEqual([
      'SSH Disabled - version 1.99',
      '%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).',
      'Authentication timeout: 120 secs; Authentication retries: 3',
    ])
    driver.typeAll('configure terminal', ...SSH_SETUP, 'crypto key generate rsa modulus 1024', 'end')
    expect(driver.type('show ip ssh')).toEqual(['SSH Enabled - version 2.0', 'Authentication timeout: 60 secs; Authentication retries: 2'])
    expect(driver.type('show ssh')).toEqual(['%No SSHv2 server connections running.'])
  })

  it('show crypto key mypubkey rsa and show users', () => {
    const driver = cli()
    driver.configure('hostname R1', 'ip domain-name lab.local', 'crypto key generate rsa modulus 1024', 'end')
    const key = driver.type('show crypto key mypubkey rsa')
    expect(key.slice(0, 5)).toEqual(['Key name: R1.lab.local', ' Storage Device: not specified', ' Usage: General Purpose Key', ' Key is not exportable.', ' Key Data:'])
    expect(key[5]).toMatch(/^ {2}([0-9A-F]{8} ){7}[0-9A-F]{8}$/)
    expect(driver.type('show users')[1]).toBe('*  0 con 0                idle                 00:00:00')
  })
})
