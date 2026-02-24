/**
 * SSRF-Schutz: Nur URLs von erlaubten Domains (21Shares, VanEck, Bitwise/ETC Group, DDA)
 */

const ALLOWED_PATTERNS = [
  // 21Shares
  /^https:\/\/[a-z0-9.-]*\.?21shares\.com(\/|$)/,
  /^https:\/\/cdn\.21shares\.com(\/|$)/,
  /^https:\/\/xvmd-hnpa-7dsw\.n7c\.xano\.io\/api:/,
  // VanEck
  /^https:\/\/[a-z0-9.-]*\.?vaneck\.com(\/|$)/,
  // Bitwise / ETC Group
  /^https:\/\/[a-z0-9.-]*\.?etc-group\.com(\/|$)/,
  /^https:\/\/[a-z0-9.-]*\.?bitwiseinvestments\.eu(\/|$)/,
  // DDA – Deutsche Digital Assets
  /^https:\/\/[a-z0-9.-]*\.?deutschedigitalassets\.com(\/|$)/,
  // JustETF – Discovery für unbekannte ISINs
  /^https:\/\/[a-z0-9.-]*\.?justetf\.com(\/|$)/,
  // CoinShares (KID/Factsheet)
  /^https:\/\/[a-z0-9.-]*\.?coinshares\.com(\/|$)/,
  /^https:\/\/kid\.ttmzero\.com(\/|$)/,
  /^https:\/\/[a-z0-9.-]*\.?etp\.coinshares\.com(\/|$)/,
  // WisdomTree
  /^https:\/\/[a-z0-9.-]*\.?wisdomtree\.(com|eu)(\/|$)/,
  /^https:\/\/dataspanapi\.wisdomtree\.com(\/|$)/,
  // FiCAS
  /^https:\/\/[a-z0-9.-]*\.?ficas\.com(\/|$)/,
  // Virtune, nxtAssets
  /^https:\/\/[a-z0-9.-]*\.?virtune\.(com|se)(\/|$)/,
  /^https:\/\/[a-z0-9.-]*\.?nxtassets\.(com|de)(\/|$)/,
];

export function isUrlAllowed(url: string): boolean {
  try {
    new URL(url);
    return ALLOWED_PATTERNS.some((p) => p.test(url));
  } catch {
    return false;
  }
}

export function validateUrlForFetch(url: string): void {
  if (!isUrlAllowed(url)) {
    throw new Error(
      `URL nicht erlaubt: ${url}. Erlaubte Anbieter: 21Shares, VanEck, Bitwise/ETC Group, DDA.`
    );
  }
}
