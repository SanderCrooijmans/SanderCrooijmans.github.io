// Post-build checks on dist/: internal links and assets, affiliate CTA integrity, disclosures, metadata, banned claims.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const AFFILIATE = 'https://oxynova.com/ref/152/';
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pages = walk(DIST).filter((p) => p.endsWith('.html'));
const BANNED = [/FDA[- ](approved|cleared|certified)/i, /Health Canada[- ]approved/i, /hospital[- ]grade/i, /medical(ly)?[- ]certified/i, /\bcures?\b/i, /reverse[sd]? (the )?ag(e|ing)/i, /guaranteed recovery/i, /\b(we are|this is) (the )?official oxynova/i, /authorized (reseller|distributor)(?! or)/i, /limited[- ]time/i, /countdown/i, /\d+% off/i];
const exists = (url) => {
  const u = url.split('#')[0].split('?')[0];
  if (!u) return true;
  const p = join(DIST, u.replace(/^\//, ''));
  return existsSync(p) && (!statSync(p).isDirectory() || existsSync(join(p, 'index.html')));
};

for (const file of pages) {
  const rel = relative(DIST, file); const html = readFileSync(file, 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  if (!/<title>[^<]{5,}<\/title>/.test(html)) err(`${rel}: missing <title>`);
  if (!/<meta name="description" content="[^"]{40,}"/.test(html)) err(`${rel}: missing/short meta description`);
  if (!/<link rel="canonical" href="https?:\/\//.test(html)) err(`${rel}: missing canonical`);
  const h1 = (html.match(/<h1[ >]/g) || []).length; if (h1 !== 1) err(`${rel}: expected 1 <h1>, found ${h1}`);
  if (!/<html lang="en"/.test(html)) err(`${rel}: missing lang`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) err(`${rel}: <img> without alt: ${m[0].slice(0, 80)}`);
  // Negated disclaimers ("we do not describe them as ...") are allowed; scan only the affirmative sentences.
  const NEG = /(do not|does not|not the|are not|is not|we are not|could not|never)/i;
  const scan = text.split(/(?<=[.!?])\s+/).filter((s) => !NEG.test(s)).join(' ');
  for (const re of BANNED) { const mm = scan.match(re); if (mm) err(`${rel}: banned phrase ${re} near: ...${scan.slice(Math.max(0, mm.index - 80), mm.index + 40).replace(/\s+/g, ' ')}...`); }
  if (/lorem|TODO|placeholder|coming soon/i.test(text)) err(`${rel}: placeholder copy`);

  // internal links + assets
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) { if (!exists(m[1])) err(`${rel}: broken internal reference ${m[1]}`); }

  // affiliate CTAs
  const ctas = [...html.matchAll(/<a\b[^>]*data-affiliate-cta[^>]*>/g)].map((m) => m[0]);
  for (const a of ctas) {
    if (!a.includes(`href="${AFFILIATE}"`)) err(`${rel}: CTA not using canonical URL: ${a}`);
    if (!/rel="sponsored noopener noreferrer"/.test(a)) err(`${rel}: CTA missing rel sponsored`);
  }
  for (const m of html.matchAll(/<a\b[^>]*href="(https?:\/\/(?:www\.)?oxynova\.com[^"]*)"[^>]*>/g)) {
    const href = m[1];
    if (m[0].includes('data-affiliate-cta')) continue;
    if (href.includes('/ref/')) err(`${rel}: untracked-component affiliate URL ${href}`);
    else if (!/contact-hyperbaric|lifetime-warranty/.test(href)) err(`${rel}: unexpected oxynova.com link ${href}`);
    else if (!/rel="noopener noreferrer"/.test(m[0])) err(`${rel}: support link missing rel`);
  }
  if (ctas.length) {
    if (!/may earn a commission/i.test(text)) err(`${rel}: CTA present without visible commission disclosure`);
  }
  if (!/Independent Oxynova affiliate/i.test(text)) err(`${rel}: missing independent-affiliate wording`);
}
const need = ['sitemap-index.xml', 'robots.txt', 'favicon.svg', 'favicon.ico', 'models/chamber-concept.glb', 'images/3d/chamber-hero-closed.webp'];
for (const n of need) if (!existsSync(join(DIST, n))) err(`missing dist/${n}`);
const glb = statSync(join(DIST, 'models/chamber-concept.glb')).size; if (glb > 5 * 1024 * 1024) warn(`GLB is ${(glb / 1048576).toFixed(1)} MB (> 5 MB budget)`);

console.log(`Checked ${pages.length} pages.`);
warnings.forEach((w) => console.log('WARN ', w));
if (errors.length) { errors.forEach((e) => console.log('FAIL ', e)); console.log(`${errors.length} problem(s).`); process.exit(1); }
console.log('All site checks passed.');
