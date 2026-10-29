# Chamber & Recovery: independent Oxynova affiliate site

Static site (Astro 5, TypeScript) with a lazy-loaded three.js viewer. United States and Europe audience; Canada excluded (see the project decision log).

## Commands
```
npm install           # pinned dependencies (package-lock.json is committed)
npm run dev           # http://localhost:4321
npm run build         # outputs dist/
npm run preview       # serves dist/ on :4321
npm test              # build + scripts/check-site.mjs (links, CTAs, disclosure, metadata, banned phrases)
node tests/browser.mjs   # real-browser checks in Microsoft Edge; needs `npm run preview` running
```

## Configuration (no secrets in source)
- `src/config.ts`: the one place for the affiliate URL, contact email, disclosure strings and support links.
- `.env` (copy `.env.example`): `SITE_URL` (final HTTPS origin, used for canonical/sitemap/OG) and `PUBLIC_INSTAGRAM_URL` (set only when the profile exists).

## Rules enforced by `scripts/check-site.mjs`
Every sales CTA must be rendered by `components/CTA.astro`, use exactly `https://oxynova.com/ref/152/` with `rel="sponsored noopener noreferrer"`, and appear on a page with a visible commission disclosure. Official support links must use `rel="noopener noreferrer"`. Pages must have a title, description, canonical, one `<h1>` and alt text. Banned phrases (such as "FDA approved", "hospital-grade", "cures", countdown or discount wording) fail the build check.

## Content
Product facts come from `src/data/product-facts.json` (manufacturer statements with source URLs; `null` renders as "Not stated by manufacturer"). Do not add a price, discount or health claim without updating the claims register.

## Deploy
The site is not deployed. `deploy/github-pages.yml` is a ready workflow (copy it to `.github/workflows/` of a repository that contains this folder, set the repository variable `SITE_URL`, enable Pages with the "GitHub Actions" source). Any static host works: upload `dist/`.
