// The app Worker (root wrangler.jsonc, docs/SHARE_PAGES.md §5): the static app is served from assets
// as before; only `/p/*` and `/api/*` run this script first (assets.run_worker_first), for share pages
// with their own link-preview tags and the share API. Everything else never reaches it.
import { OriginPolicy } from '../live/OriginPolicy'
import { RateLimitGuard } from '../platform/RateLimitGuard'
import { SHARE_STORE_NAME } from '../share/shareStoreName'
import type { AppWorkerEnv, ShareStoreStub } from './AppWorkerEnv'
import { ShareHttpApi } from './ShareHttpApi'
import { SharePageHtml } from './SharePageHtml'

export default {
  async fetch(request: Request, env: AppWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const store = (): ShareStoreStub => env.SHARE_STORE.get(env.SHARE_STORE.idFromName(SHARE_STORE_NAME))
    if (ShareHttpApi.handles(url)) {
      return new ShareHttpApi({ store, origins: new OriginPolicy(env.APP_ORIGINS), limiter: new RateLimitGuard(env.SHARE_WRITE_LIMITER) }).handle(request)
    }
    if (SharePageHtml.handles(url) && (request.method === 'GET' || request.method === 'HEAD')) {
      return new SharePageHtml({ assets: env.ASSETS, store }).handle(request)
    }
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'notFound', message: 'There is no API at this address.' }, { status: 404 })
    // Any other /p/* path: the app shell (the SPA shows its own not-found handling).
    return env.ASSETS.fetch(request)
  },
}
