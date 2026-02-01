// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { remarkAlert } from 'remark-github-blockquote-alert';

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],

  site: 'https://ra1nei.github.io',
  base: '/rainei-lyrics-list',

  markdown: {
    remarkPlugins: [remarkAlert],
  },

  vite: {
    plugins: [tailwindcss()]
  },

  devToolbar: {
    enabled: false
  },
});