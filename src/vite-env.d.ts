/// <reference types="vite/client" />

// Build-time settings (Vite `import.meta.env`). Only `VITE_` variables reach the app.
interface ImportMetaEnv {
  /** Live labs (docs/LIVE_LABS.md §8): origin of the MCP Worker that serves `/live/<labId>`. */
  readonly VITE_LIVE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
