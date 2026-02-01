// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { remarkAlert } from 'remark-github-blockquote-alert';

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],

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