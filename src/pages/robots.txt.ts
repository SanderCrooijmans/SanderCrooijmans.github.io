import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = site ? site.href : 'http://localhost:4321/';
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', base).href}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
