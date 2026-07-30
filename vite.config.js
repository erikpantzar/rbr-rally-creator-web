import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://erikpantzar.github.io/rbr-rally-creator-web/ (a
// GitHub Pages *project* site, not a user/org root site) -- every asset URL
// needs the repo name as a base path, or the built index.html references
// /assets/... which 404s once it's not served from the domain root.
export default defineConfig({
  plugins: [react()],
  base: '/rbr-rally-creator-web/',
})
