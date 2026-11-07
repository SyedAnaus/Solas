import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * GitHub Pages serves this app from https://OWNER.github.io/REPOSITORY/.
 * CI sets BASE_PATH from the repository name; locally we default to /Solas/
 * so dev and preview use the same nested paths as production.
 */
function resolveBase(): string {
  const raw = process.env.BASE_PATH ?? '/Solas/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          return undefined;
        },
      },
    },
  },
});
