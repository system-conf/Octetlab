import { describe, expect, it } from 'vitest'
import { shareTestLab } from '../../../src/features/share/model/testShareLab'
import { OgImageSvg } from './OgImageSvg'
import { OgTextLayout } from './OgTextLayout'

describe('OgTextLayout', () => {
  it('wraps at spaces and keeps short text on one line', () => {
    expect(OgTextLayout.wrap('Cafe network', 30, 2)).toEqual(['Cafe network'])
    expect(OgTextLayout.wrap('Ofis güvenlik duvarının arkasında', 20, 2)).toEqual(['Ofis güvenlik', 'duvarının arkasında'])
  })

  it('ends the last line with an ellipsis when text is left over', () => {
    const lines = OgTextLayout.wrap('one two three four five six seven eight', 10, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]?.endsWith('…')).toBe(true)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10)
  })

  it('breaks a word longer than a line', () => {
    expect(OgTextLayout.wrap('abcdefghijkl', 5, 3)).toEqual(['abcde', 'fghij', 'kl'])
  })

  it('truncates and escapes', () => {
    expect(OgTextLayout.truncate('Süleyman Talha', 8)).toBe('Süleyma…')
    expect(OgTextLayout.truncate('Ada', 8)).toBe('Ada')
    expect(OgTextLayout.escape(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;')
  })
})

describe('OgImageSvg text', () => {
  it('puts the escaped title, the brand and the author into the picture', () => {
    const svg = OgImageSvg.build(shareTestLab(), { title: 'R&D <lab>', author: 'Çağrı "Ç" Öztürk' })
    expect(svg).toContain('>R&amp;D &lt;lab&gt;</text>')
    expect(svg).toContain('>Octetlab</text>')
    expect(svg).toContain('>Çağrı &quot;Ç&quot; Öztürk</text>')
    expect(svg).not.toContain('<lab>')
  })

  it('shows the colour legend instead of an author when none is given', () => {
    const svg = OgImageSvg.build(shareTestLab(), { title: 'Cafe', author: '  ' })
    expect(svg).not.toContain('text-anchor="end"')
    expect(svg).toContain('rx="6"')
  })
})
