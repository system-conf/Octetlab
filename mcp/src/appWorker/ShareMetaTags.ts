// The <head> tags of a share page (docs/SHARE_PAGES.md §6): title, description, Open Graph and
// Twitter card, written into the HTML by the app Worker because link-preview crawlers do not run
// JavaScript. Every value is user text: cleaned, shortened and HTML-escaped here, in one place.
import { ShareText } from '../../../src/features/share/model/ShareText'
import type { ShareMeta } from '../share/ShareService'

const SITE_NAME = 'Octetlab'
const TITLE_LENGTH = 90
const DESCRIPTION_LENGTH = 200
/** The app's own share image (public/ogImage.png), for shares without a rendered topology. */
const DEFAULT_IMAGE_PATH = '/ogImage.png'

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export class ShareMetaTags {
  /** Selectors of the app's default tags in index.html that the share page replaces. */
  static readonly replacedSelectors = [
    'title',
    'meta[name="description"]',
    'meta[property^="og:"]',
    'meta[name^="twitter:"]',
    'link[rel="canonical"]',
  ] as const

  /** `origin`: the app origin (https://…), used for absolute og:url / og:image. */
  static html(meta: ShareMeta, origin: string): string {
    const title = ShareText.shorten(ShareText.line(meta.title), TITLE_LENGTH)
    const author = ShareText.line(meta.author)
    const pageTitle = `${title} · ${SITE_NAME}`
    const description = ShareMetaTags.description(meta, author)
    const pageUrl = `${origin}/p/${encodeURIComponent(meta.id)}`
    const image = meta.hasImage ? `${pageUrl}/og.png` : `${origin}${DEFAULT_IMAGE_PATH}`
    const imageAlt = `${title} — network topology in Octetlab`
    const tags: [kind: 'name' | 'property', key: string, value: string][] = [
      ['name', 'description', description],
      ['name', 'robots', 'noindex'],
      ['property', 'og:type', 'article'],
      ['property', 'og:site_name', SITE_NAME],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:url', pageUrl],
      ['property', 'og:image', image],
      ['property', 'og:image:type', 'image/png'],
      ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '630'],
      ['property', 'og:image:alt', imageAlt],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
      ['name', 'twitter:image', image],
      ['name', 'twitter:image:alt', imageAlt],
    ]
    return [
      `<title>${escapeHtml(pageTitle)}</title>`,
      `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`,
      ...tags.map(([kind, key, value]) => `<meta ${kind}="${key}" content="${escapeHtml(value)}" />`),
    ].join('\n    ')
  }

  /** The user's description (first paragraph), else a generated sentence. */
  private static description(meta: ShareMeta, author: string): string {
    const own = ShareText.line(meta.description.split('\n')[0] ?? '')
    if (own !== '') return ShareText.shorten(own, DESCRIPTION_LENGTH)
    const by = author === '' ? '' : ` by ${author}`
    return ShareText.shorten(`A network lab${by}, built in Octetlab: topology, devices, VLANs and subnets.`, DESCRIPTION_LENGTH)
  }
}
