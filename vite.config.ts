import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const PUBLIC = 'web/public';

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// Emits sw.js, which precaches the whole app (code + data) so it works offline.
// Its cache name is a hash of everything it caches, so any change to the app or
// data yields a new service worker that replaces the old cache.
function offline(): Plugin {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = walk(PUBLIC).map((f) => relative(PUBLIC, f));
      const files = ['./', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles];
      const hash = createHash('sha256');
      for (const out of Object.values(bundle)) hash.update(out.type === 'chunk' ? out.code : out.source);
      for (const f of publicFiles) hash.update(readFileSync(join(PUBLIC, f)));
      const source = readFileSync('web/sw.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  root: 'web',
  base: './', // relative, so the build works from any path (e.g. GitHub Pages /kanji/)
  plugins: [react(), offline()],
  build: { outDir: 'dist', emptyOutDir: true },
  // host: true so the dev server is reachable from your phone on the same network.
  server: { host: true },
});
