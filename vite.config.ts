import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, existsSync, statSync, cpSync } from 'node:fs';
import { resolve, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACK_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), 'assets/pack');
const PACK_SERVED = ['models', 'audio', 'cards'];
const MIME: Record<string, string> = { '.json': 'application/json', '.mp3': 'audio/mpeg', '.webp': 'image/webp' };

/** Serves assets/pack at ./pack/ in dev and preview, and copies it into dist/pack on build. */
function packAssets(): Plugin {
  let outDir = 'dist';
  const serve = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[/\\]+/, '');
    const file = join(PACK_DIR, rel);
    if (!file.startsWith(PACK_DIR) || !PACK_SERVED.includes(rel.split(/[/\\]/)[0]) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'locker-wars-pack',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    configureServer(server) { server.middlewares.use('/pack', serve); },
    closeBundle() { for (const d of PACK_SERVED) cpSync(join(PACK_DIR, d), join(outDir, 'pack', d), { recursive: true }); },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  plugins: [
    packAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Locker Wars',
        short_name: 'Locker Wars',
        description: 'Bid on mystery storage lockers against a rowdy crowd of rival buyers.',
        theme_color: '#12100e',
        background_color: '#12100e',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        // 29 MB of models, voices and cards: cache them as they are used, never all up front.
        globIgnores: ['pack/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // The item catalog is a separate page deployed next to the game; never answer it with the game shell.
        navigateFallbackDenylist: [/item-catalog\.html$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/pack/'),
            handler: 'CacheFirst',
            options: { cacheName: 'locker-wars-pack', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
} as any);
