// Single source of truth for affiliate attribution, contact and disclosure copy.
// Every commercial manufacturer link must come from AFFILIATE_URL (see components/CTA.astro).

/** Canonical tracked destination. Do not append guessed parameters or coupon codes. */
export const AFFILIATE_URL = 'https://oxynova.com/ref/152/';

export const CONTACT_EMAIL = 'webdesignsanderc@gmail.com';

/** Empty until the Instagram profile really exists. */
export const INSTAGRAM_URL: string = (import.meta.env.PUBLIC_INSTAGRAM_URL as string | undefined) ?? '';

export const SITE_NAME = 'Chamber & Recovery';
export const SITE_TAGLINE = 'Independent Oxynova affiliate';

/** Working identity; a draft name, not a cleared trademark or an owned domain. */
export const DISCLOSURE_SHORT =
  'Independent Oxynova affiliate. We may earn a commission when you purchase through our links.';

export const DISCLOSURE_LONG =
  'This website is operated independently. It is not the official Oxynova website and is not operated by the manufacturer. ' +
  'If you buy through links to oxynova.com on this site, the operator may earn a commission. We do not add anything to your price. ' +
  'Product facts are manufacturer statements as published on the dates shown, not independent testing or endorsements.';

/** Official manufacturer support routes, labelled separately from sales links. */
export const MANUFACTURER_SUPPORT = {
  contactPage: 'https://oxynova.com/contact-hyperbaric/',
  warrantyPage: 'https://oxynova.com/lifetime-warranty/',
  email: 'info@oxynova.com',
  phoneUS: '1-800-481-0481',
};

export const REGION_NOTICE =
  'This site is written for visitors in the United States and Europe. Rules for these chambers differ by country, so ask the manufacturer in writing about the regulatory status for your country before you buy. Canada is not covered.';

export const DATA_ACCESS_DATE = '2026-10-27';
