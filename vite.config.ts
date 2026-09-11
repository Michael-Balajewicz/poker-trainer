import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths, so a built dist/ works under any subpath (e.g. a
  // GitHub Pages project site). Safe here only because there is no router.
  base: './',
})
