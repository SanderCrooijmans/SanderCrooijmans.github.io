// Typed view over product-facts.json. Unknown values stay null and render as "Not stated by manufacturer".
import facts from './product-facts.json';

export const NOT_STATED = 'Not stated by manufacturer';

type Raw = (typeof facts.series)['series7'];
export interface Series {
  slug: string; key: 'series7' | 'series8' | 'series9'; name: string; short: string; raw: Raw;
  summary: string; sources: string[];
}

const make = (slug: Series['slug'], key: Series['key'], name: string, short: string, summary: string): Series => ({
  slug, key, name, short, raw: facts.series[key], summary, sources: (facts.series[key] as any).sources ?? [],
});

export const series: Series[] = [
  make('series-7', 'series7', 'Oxynova Series 7', 'Series 7',
    'Oxynova positions Series 7 as accessible technology for personal use at home. It is the smallest of the three models covered on this site.'),
  make('series-8', 'series8', 'Oxynova Series 8', 'Series 8',
    'Oxynova positions Series 8 for professional settings such as sport centres and wellness locations, and also for domestic use.'),
  make('series-9', 'series9', 'Oxynova Series 9', 'Series 9',
    'The largest of the three models. Oxynova describes it as hosting up to two users and as suited to larger commercial settings.'),
];

export const bySlug = (slug: string) => series.find((s) => s.slug === slug);

export const dims = (s: Series) => {
  const r = s.raw as any;
  return {
    pressure: r.pressureATA != null ? `${r.pressureATA} ATA` : null,
    diameter: r.diameterCm != null ? `${r.diameterCm} cm (${r.diameterIn} in)` : null,
    length: r.lengthCm != null ? `${r.lengthCm} cm (${r.lengthIn} in)` : null,
    weight: r.weightKg != null ? `${r.weightKg} kg (${r.weightLb} lb)` : null,
    windows: r.windows ? `${r.windows.count}, ${r.windows.layers} layer, ${r.windows.diameterMm} mm` : null,
    fittings: r.passThroughFittings != null ? String(r.passThroughFittings) : null,
    capacity: s.key === 'series9' ? 'Up to two users (manufacturer statement)' : s.key === 'series8' ? 'Two users mentioned on the product page; formal rating not stated' : null,
    noise: r.soundLevelDbA ? `${r.soundLevelDbA} dBA (compressor, manufacturer statement)` : null,
    power: r.power ?? null,
    interiorSize: r.internalDimensions ?? null,
  };
};

export const meta = facts._meta;
export const warranty = facts.warranty;
export const construction = facts.construction;
export const support = facts.support;
export const regulatory = facts._meta.regulatory;
