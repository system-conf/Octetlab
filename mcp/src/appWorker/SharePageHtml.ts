// `/p/<id>` (docs/SHARE_PAGES.md §6): the app's index.html with the share's own title, description
// and Open Graph image, so LinkedIn / WhatsApp / X previews show the lab. The SPA then renders the
// page itself from /api/shares/<id>. Unknown ids get the plain app shell with status 404.
import { SHARE_ID_PATTERN } from '../../../src/features/share/model/shareLimits'
import type { ShareMeta } from '../share/ShareService'
import type { AssetsBinding, ShareStoreStub } from './AppWorkerEnv'
import { ShareMetaTags } from './ShareMetaTags'

const PAGE_ROUTE = /^\/p\/([^/]+)\/?$/

export interface SharePageHtmlDeps {
  assets: AssetsBinding
  store: () => ShareStoreStub
}

export class SharePageHtml {
  private readonly deps: SharePageHtmlDeps

  constructor(deps: SharePageHtmlDeps) {
    this.deps = deps
  }

  static handles(url: URL): boolean {
    return PAGE_ROUTE.test(url.pathname)
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    // `/` is index.html (html_handling would redirect a request for /index.html).
    const shell = await this.deps.assets.fetch(new Request(new URL('/', url.origin).toString(), { headers: request.headers }))
    const id = PAGE_ROUTE.exec(url.pathname)?.[1] ?? ''
    let meta: ShareMeta | null
    try {
      meta = SHARE_ID_PATTERN.test(id) ? await this.deps.store().meta(id) : null
    } catch (error) {
      // The store is unreachable: the page still loads (the app shows its own error), only without previews.
      console.error(`Share page ${id}: the share could not be read for the meta tags`, error)
      return this.withHeaders(shell, 503)
    }
    if (meta === null) return this.withHeaders(shell, 404)
    const tags = ShareMetaTags.html(meta, url.origin)
    let rewriter = new HTMLRewriter()
    for (const selector of ShareMetaTags.replacedSelectors) rewriter = rewriter.on(selector, { element: (element) => element.remove() })
    rewriter = rewriter.on('head', { element: (element) => element.append(tags, { html: true }) })
    return rewriter.transform(this.withHeaders(shell, 200))
  }

  private withHeaders(shell: Response, status: number): Response {
    const headers = new Headers(shell.headers)
    for (const name of ['Content-Length', 'ETag']) headers.delete(name)
    headers.set('Cache-Control', 'public, max-age=300')
    return new Response(shell.body, { status, headers })
  }
}
