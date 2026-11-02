import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves from /<repo-name>/. The deploy workflow sets BASE_PATH; local dev and other hosts use "/".
  base: process.env.BASE_PATH ?? '/',
  server: {
    port: 3000,
    open: true,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // esbuild is Vite's built-in minifier. terser was used before but is not a declared dependency.
    minify: 'esbuild',
  },
})
