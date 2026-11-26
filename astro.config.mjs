// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ra1nei.github.io',
  base: '/rainei-lyrics-list',
  vite: { worker: { format: 'es' } },
  devToolbar: { enabled: false },
});
