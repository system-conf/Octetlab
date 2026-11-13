// The Workers HTMLRewriter API (developers.cloudflare.com/workers/runtime-apis/html-rewriter/), declared
// with only the members the app Worker uses (the project has no @cloudflare/workers-types).

interface HtmlRewriterElement {
  remove(): HtmlRewriterElement
  append(content: string, options?: { html: boolean }): HtmlRewriterElement
}

interface HtmlRewriterHandlers {
  element?(element: HtmlRewriterElement): void
}

declare class HTMLRewriter {
  on(selector: string, handlers: HtmlRewriterHandlers): HTMLRewriter
  transform(response: Response): Response
}
