import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Set SITE_URL to the final HTTPS origin before building for production.
const site = process.env.SITE_URL || 'http://localhost:4321';

export default defineConfig({
  site,
  trailingSlash: 'always',
  integrations: [sitemap()],
  build: { inlineStylesheets: 'auto' },
});
