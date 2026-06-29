import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: a single fallback HTML, no SSR, no prerender (data is realtime).
    adapter: adapter({ fallback: 'index.html', strict: false }),
  },
};
