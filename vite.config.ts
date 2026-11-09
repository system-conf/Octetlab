/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    // mcp/: the MCP server Worker (docs/MCP_SERVER.md); its tests run here, its code is bundled by wrangler.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'mcp/**/*.test.ts'],
    passWithNoTests: true,
  },
})
