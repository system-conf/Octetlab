// Name of the single ShareStore Durable Object (`idFromName`), in its own module so the app Worker
// can use it without bundling the store (resvg WebAssembly, SQLite repository).
export const SHARE_STORE_NAME = 'shares'
