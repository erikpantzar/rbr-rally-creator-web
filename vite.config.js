import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Baked in at build time so the running app can show which commit it was
// built from (small text next to the title, linking to the commit on
// GitHub) -- since deploys happen right after merging a PR, this always
// reflects the latest merged change without needing any manual per-merge
// update. Falls back to 'unknown' for a build run outside a git checkout
// (e.g. a stray `npm run build` from a downloaded zip).
function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// Served from https://erikpantzar.github.io/rbr-rally-creator-web/ (a
// GitHub Pages *project* site, not a user/org root site) -- every asset URL
// needs the repo name as a base path, or the built index.html references
// /assets/... which 404s once it's not served from the domain root.
export default defineConfig({
  plugins: [react()],
  base: '/rbr-rally-creator-web/',
  define: {
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
  },
})
