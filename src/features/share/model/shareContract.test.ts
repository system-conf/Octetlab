import { describe, expect, it } from 'vitest'
import { shareDraftSchema } from './shareContract'
import { canonicalLinkedInUrl, ShareText } from './ShareText'

describe('ShareText', () => {
  it('cleans one-line text: controls, bidi overrides and angle brackets removed, spaces collapsed', () => {
    expect(ShareText.line('  My\u0000 <b>lab</b>‮  \n here ')).toBe('My blab/b here')
  })

  it('keeps paragraphs but at most one empty line between them', () => {
    expect(ShareText.paragraphs('First\r\n\r\n\r\n\r\nSecond  line\nthird')).toBe('First\n\nSecond line\nthird')
  })

  it('shortens by code points with an ellipsis', () => {
    expect(ShareText.shorten('abcdef', 4)).toBe('abc…')
    expect(ShareText.shorten('ab', 4)).toBe('ab')
  })
})

describe('canonicalLinkedInUrl', () => {
  it.each([
    ['https://www.linkedin.com/in/ada-lovelace/', 'https://www.linkedin.com/in/ada-lovelace'],
    ['https://tr.linkedin.com/in/ali_veli', 'https://www.linkedin.com/in/ali_veli'],
    ['https://linkedin.com/in/x%C3%A7y', 'https://www.linkedin.com/in/x%C3%A7y'],
  ])('accepts %s', (input, expected) => {
    expect(canonicalLinkedInUrl(input)).toBe(expected)
  })

  it.each(['http://www.linkedin.com/in/ada', 'https://linkedin.com.evil.example/in/ada', 'https://www.linkedin.com/company/acme', 'javascript:alert(1)', 'not a url'])(
    'rejects %s',
    (input) => {
      expect(canonicalLinkedInUrl(input)).toBeNull()
    },
  )
})

describe('shareDraftSchema', () => {
  const valid = { doc: '{}', title: ' My lab ', author: 'Ada', linkedinUrl: '', description: 'Two VLANs.' }

  it('cleans the texts and keeps an empty LinkedIn field', () => {
    expect(shareDraftSchema.parse(valid)).toEqual({ ...valid, title: 'My lab' })
  })

  it('requires a title and a LinkedIn profile link when one is given', () => {
    expect(shareDraftSchema.safeParse({ ...valid, title: ' <> ' }).success).toBe(false)
    expect(shareDraftSchema.safeParse({ ...valid, linkedinUrl: 'https://example.com' }).success).toBe(false)
    expect(shareDraftSchema.parse({ ...valid, linkedinUrl: 'https://de.linkedin.com/in/ada' }).linkedinUrl).toBe('https://www.linkedin.com/in/ada')
  })

  it('refuses over-long fields', () => {
    expect(shareDraftSchema.safeParse({ ...valid, title: 'x'.repeat(101) }).success).toBe(false)
    expect(shareDraftSchema.safeParse({ ...valid, doc: 'x'.repeat(256_001) }).success).toBe(false)
  })
})
