import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { legacyPaths, routePaths } from './src/app/routes.js';

// Cloudflare only serves files, so opening /reports directly would 404. _redirects serves the app for every route.
function spaRedirects() {
  return {
    name: 'spa-redirects',
    apply: 'build',
    writeBundle({ dir }) {
      const paths = [...Object.values(routePaths), ...Object.keys(legacyPaths)].filter((route) => route !== '/');
      fs.writeFileSync(path.join(dir, '_redirects'), paths.map((route) => `${route} / 200`).join('\n') + '\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), spaRedirects()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
