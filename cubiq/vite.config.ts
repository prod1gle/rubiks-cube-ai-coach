import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const proxy = {
  '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [
        { name: 'three', test: /node_modules[\\/]three[\\/]/, maxSize: 400_000, includeDependenciesRecursively: false },
        { name: 'fiber', test: /node_modules[\\/]@react-three[\\/]/, includeDependenciesRecursively: false },
      ] } },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
