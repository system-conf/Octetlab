// The stable live link of a lab (docs/LIVE_LABS.md §7): `<APP_ORIGIN>/live/<labId>`.

export class LiveLinks {
  private readonly appOrigin: string

  constructor(appOrigin: string) {
    this.appOrigin = appOrigin.replace(/\/+$/, '')
  }

  url(labId: string): string {
    return `${this.appOrigin}/live/${labId}`
  }

  /** The sentence create_lab / open_sample / import_share_link / build_lab add to their text. */
  sentence(labId: string): string {
    return `Watch it live: ${this.url(labId)} (keep this tab open; it updates as I work)`
  }
}
