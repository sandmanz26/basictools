/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
          if (id.includes('@azure/msal')) return 'msal'
          if (id.includes('react-router') || id.includes('node_modules/react/') || id.includes('react-dom')) return 'react'
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
})
