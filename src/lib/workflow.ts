/**
 * WorkflowEngine: Pipeline für Abruf und Verarbeitung von Factsheet-Gewichten
 * Unterstützte Anbieter: 21Shares, VanEck, Bitwise/ETC Group, DDA
 */

import { createHash } from "crypto";
import mappingData from "@/data/isin-mapping.json";
import { validateUrlForFetch } from "./allowlist";
import {
  PARSE_VERSION,
  CACHE_TTL_SUCCESS_MS,
  CACHE_TTL_FAILURE_MS,
  FETCH_RETRIES,
  USER_AGENT,
} from "./constants";
import { prisma } from "./db";
import { extractTextViaOcr } from "./pdf-ocr";
import { downloadPdf, extractTextFromPdf } from "./pdf-extract";
import { parseFactsheetText, ConstituentWeight } from "./parser";
import { fetchConstituentsFromApi, fetchNavFromApi, resolveTickerFromProductList } from "./holdings-api";

export interface WeightsResult {
  isin: string;
  asOfDate: string | null;
  constituents: ConstituentWeight[];
  navUsd: number | null;
  sourcePdfUrl: string;
  cacheStatus: "HIT" | "MISS";
  fetchedAt: string;
}

export interface WorkflowError {
  code: string;
  message: string;
  httpStatus?: number;
}

type Provider = "21shares" | "vaneck" | "bitwise" | "dda" | "coinshares" | "wisdomtree" | "justetf" | "unknown";

interface MappingEntry {
  provider?: string;
  ticker?: string;
  productPageUrl?: string;
  factsheetUrl?: string | null;
}

const mapping = mappingData as Record<string, MappingEntry>;

function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase().replace(/\s/g, "");
}

function validateIsinFormat(isin: string): void {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
    throw new Error(
      "Ungültiges ISIN-Format. Erwartet: 12 Zeichen (2 Buchstaben + 9 alphanumerisch + 1 Prüfziffer)"
    );
  }
}

function detectProvider(isin: string): Provider {
  const entry = mapping[isin];
  if (entry?.provider) return entry.provider as Provider;
  return "unknown";
}

// ─────────────────────────────────────────────
// 21Shares URL-Discovery (bestehende Logik)
// ─────────────────────────────────────────────

const PRODUCT_LIST_PDF_URL_21S =
  "https://cdn.21shares.com/uploads/current-documents/products/product-list/Product_List.pdf";

const TICKER_CURRENCIES = new Set(["CHF", "EUR", "USD", "GBP", "SEK"]);

function extractAllCandidateTickers(block: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  function add(ticker: string) {
    if (
      !seen.has(ticker) &&
      !TICKER_CURRENCIES.has(ticker) &&
      ticker.length >= 3 &&
      ticker.length <= 8
    ) {
      seen.add(ticker);
      candidates.push(ticker);
    }
  }

  const m1 = block.match(/(?:CHF|EUR|USD|GBP|SEK)([A-Z]{3,8})(?:CHF|EUR|USD|GBP|SEK)\s*SE/);
  if (m1) add(m1[1]);

  for (const m of block.matchAll(/(?:CHF|EUR|USD|GBP|SEK)([A-Z]{3,8})\s+(?:SE|NA)\b/g)) add(m[1]);
  for (const m of block.matchAll(/–([A-Z]{3,8})\s+(?:FP|NA|SE)\b/g)) add(m[1]);
  for (const m of block.matchAll(/–([A-Z]{3,8})\s+(?:BW|AV|IM|SS)\b/g)) add(m[1]);
  for (const m of block.matchAll(/–([A-Z]{3,8})\s+GY\b/g)) add(m[1]);

  return candidates;
}

async function discoverFactsheetFrom21SharesProductPage(
  productPageUrl: string
): Promise<string | null> {
  validateUrlForFetch(productPageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(productPageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /href="(https:\/\/cdn\.21shares\.com[^"]*Factsheet[^"]*\.pdf)"/i
    );
    return match ? match[1] : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function discoverFrom21SharesProductListing(isin: string): Promise<string | null> {
  validateUrlForFetch(PRODUCT_LIST_PDF_URL_21S);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(PRODUCT_LIST_PDF_URL_21S, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return null;

    const pdfParse = (await import("pdf-parse")).default;
    const { text } = await pdfParse(buf);
    if (!text || !text.includes(isin)) return null;

    const isinIdx = text.indexOf(isin);
    const block = text.slice(isinIdx, isinIdx + 300);
    const candidates = extractAllCandidateTickers(block);
    if (candidates.length === 0) return null;

    const m1 = block.match(/(?:CHF|EUR|USD|GBP|SEK)([A-Z]{3,8})(?:CHF|EUR|USD|GBP|SEK)\s*SE/);
    if (m1 && candidates[0] === m1[1]) {
      const url = `https://cdn.21shares.com/uploads/current-documents/factsheets/all/Factsheet_${candidates[0]}.pdf`;
      validateUrlForFetch(url);
      return url;
    }

    for (const ticker of candidates) {
      const url = `https://cdn.21shares.com/uploads/current-documents/factsheets/all/Factsheet_${ticker}.pdf`;
      validateUrlForFetch(url);
      try {
        const headRes = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT },
        });
        if (headRes.ok) return url;
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function discoverFrom21SharesFactsheetListing(isin: string): Promise<string | null> {
  const listingUrl = "https://21shares.com/en-ch/ir/factsheets";
  validateUrlForFetch(listingUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(listingUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes(isin)) return null;
    const match = html.match(
      /href="(https:\/\/cdn\.21shares\.com[^"]*Factsheet[^"]*\.pdf)"/i
    );
    return match ? match[1] : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─────────────────────────────────────────────
// VanEck URL-Discovery
// ─────────────────────────────────────────────

async function discoverVanEckFactsheetUrl(
  productPageUrl: string
): Promise<string | null> {
  validateUrlForFetch(productPageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(productPageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();

    // Suche nach Factsheet-Link (PDF) auf der Produktseite
    const patterns = [
      /href="(https:\/\/[a-z0-9.-]*vaneck\.com[^"]*(?:factsheet|fact[-_]sheet|Factsheet)[^"]*\.pdf)"/i,
      /href="(https:\/\/[a-z0-9.-]*vaneck\.com[^"]*\.pdf)"/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        validateUrlForFetch(match[1]);
        return match[1];
      }
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─────────────────────────────────────────────
// Bitwise / ETC Group URL-Discovery
// ─────────────────────────────────────────────

async function discoverBitwiseFactsheetUrl(
  productPageUrl: string
): Promise<string | null> {
  validateUrlForFetch(productPageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(productPageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();

    // Suche nach Factsheet-Link auf der ETC Group Produktseite
    const patterns = [
      /href="(https:\/\/[a-z0-9.-]*etc-group\.com[^"]*(?:fact[_-]sheet|factsheet)[^"]*\.pdf)"/i,
      /href="(https:\/\/[a-z0-9.-]*bitwiseinvestments\.eu[^"]*\.pdf)"/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        validateUrlForFetch(match[1]);
        return match[1];
      }
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─────────────────────────────────────────────
// DDA URL-Discovery
// ─────────────────────────────────────────────

async function discoverDdaFactsheetUrl(
  productPageUrl: string
): Promise<string | null> {
  validateUrlForFetch(productPageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(productPageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();

    // Suche nach englischem Factsheet (bevorzugt), dann deutschem
    const enMatch = html.match(
      /href="(https:\/\/[a-z0-9.-]*deutschedigitalassets\.com[^"]*Factsheet-en\.pdf)"/i
    );
    if (enMatch) {
      validateUrlForFetch(enMatch[1]);
      return enMatch[1];
    }

    const deMatch = html.match(
      /href="(https:\/\/[a-z0-9.-]*deutschedigitalassets\.com[^"]*Factsheet[^"]*\.pdf)"/i
    );
    if (deMatch) {
      validateUrlForFetch(deMatch[1]);
      return deMatch[1];
    }

    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─────────────────────────────────────────────
// JustETF Discovery (für beliebige ISINs ohne Mapping)
// ─────────────────────────────────────────────

const JUSTETF_PROFILE_URL = "https://www.justetf.com/en/etf-profile.html";

function detectProviderFromUrl(url: string): Provider {
  if (/21shares\.com|cdn\.21shares\.com/i.test(url)) return "21shares";
  if (/vaneck\.com/i.test(url)) return "vaneck";
  if (/bitwiseinvestments\.eu|etc-group\.com/i.test(url)) return "bitwise";
  if (/deutschedigitalassets\.com/i.test(url)) return "dda";
  if (/coinshares\.com|kid\.ttmzero\.com/i.test(url)) return "coinshares";
  if (/wisdomtree\.(com|eu)|dataspanapi\.wisdomtree/i.test(url)) return "wisdomtree";
  return "unknown";
}

interface JustEtfDiscoveryWithPdf {
  provider: Provider;
  factsheetUrl: string;
  constituents?: undefined;
  sourceUrl?: undefined;
}

interface JustEtfDiscoveryWithConstituents {
  provider: "justetf";
  factsheetUrl?: undefined;
  constituents: ConstituentWeight[];
  sourceUrl: string;
}

type JustEtfDiscovery = JustEtfDiscoveryWithPdf | JustEtfDiscoveryWithConstituents;

const JUSTETF_INDEX_TO_TICKER: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  "ripple (xrp)": "XRP",
  xrp: "XRP",
  ripple: "XRP",
  solana: "SOL",
  cardano: "ADA",
  polkadot: "DOT",
  dot: "DOT",
  litecoin: "LTC",
  avalanche: "AVAX",
  polygon: "MATIC",
  chainlink: "LINK",
  uniswap: "UNI",
  "internet computer": "ICP",
  aptos: "APT",
  sui: "SUI",
  near: "NEAR",
};

const JUSTETF_SINGLE_ASSET_PATTERNS = [
  "ethereum",
  "bitcoin",
  "xrp",
  "ripple",
  "solana",
  "cardano",
  "polkadot",
  "litecoin",
  "avalanche",
  "polygon",
  "chainlink",
  "uniswap",
];

/** Extrahiert Single-Asset-Konstituenten aus JustETF-Profilseite (Index/Investment Focus) */
function extractConstituentsFromJustEtfHtml(html: string, productTitle?: string): ConstituentWeight[] | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // "Index: Ethereum" / "Index: Bitcoin" / "Index: Ripple (XRP)"
  const indexMatch = text.match(/Index:\s*([A-Za-z]+(?:\s*\([A-Z]+\))?)/i);
  if (indexMatch) {
    const raw = indexMatch[1].trim().toLowerCase();
    const normalized = raw.replace(/\s*\([a-z]+\)$/, "").trim();
    const ticker = JUSTETF_INDEX_TO_TICKER[raw] ?? JUSTETF_INDEX_TO_TICKER[normalized];
    if (ticker) return [{ name: ticker, weight: 100 }];
  }

  // "tracks the value of the cryptocurrency Ethereum/Bitcoin"
  const cryptoMatch = text.match(/cryptocurrency\s+(Ethereum|Bitcoin|XRP|Ripple|Solana|Cardano|Polkadot|Litecoin)/i);
  if (cryptoMatch) {
    const asset = cryptoMatch[1].toLowerCase();
    const ticker = JUSTETF_INDEX_TO_TICKER[asset] ?? (asset === "ripple" ? "XRP" : null);
    if (ticker) return [{ name: ticker, weight: 100 }];
  }

  // Investment focus / Data-Tabelle: "Ethereum" als Tabellenwert
  const dataMatch = html.match(/Investment focus[\s\S]{0,300}?>(Ethereum|Bitcoin|XRP|Ripple|Solana|Cardano|Polkadot|Litecoin)</i);
  if (dataMatch) {
    const asset = dataMatch[1].toLowerCase();
    const ticker = JUSTETF_INDEX_TO_TICKER[asset] ?? (asset === "ripple" ? "XRP" : null);
    if (ticker) return [{ name: ticker, weight: 100 }];
  }

  // Fallback: Produkttitel z.B. "1Valour Ethereum Physical Staking" → genau ein Crypto
  if (productTitle) {
    const titleLower = productTitle.toLowerCase();
    let found: string | null = null;
    for (const p of JUSTETF_SINGLE_ASSET_PATTERNS) {
      if (titleLower.includes(p)) {
        if (found) {
          found = null;
          break; // Mehrere Coins → kein Single-Asset
        }
        found = p;
      }
    }
    if (found) {
      const ticker = JUSTETF_INDEX_TO_TICKER[found] ?? (found === "ripple" ? "XRP" : null);
      if (ticker) return [{ name: ticker, weight: 100 }];
    }
  }

  return null;
}

/** Extrahiert Anbieter und Produktname aus JustETF-Profilseite, konstruiert Factsheet-URL */
async function discoverFromJustEtf(isin: string): Promise<JustEtfDiscovery | null> {
  const url = `${JUSTETF_PROFILE_URL}?isin=${encodeURIComponent(isin)}`;
  validateUrlForFetch(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();

    // ISIN nicht bei JustETF → Screener-Seite mit "ETF Screener | justETF" oder "All ETFs (0)"
    const titleMatch = html.match(/<title>([^|]+)/);
    const productTitle = titleMatch?.[1]?.trim() ?? "";
    if (!productTitle || /ETF Screener|All ETFs/i.test(productTitle)) return null;

    // 1. PDF-Links aus der Seite extrahieren (Factsheet-Links von Anbietern)
    const pdfLinkRe =
      /href="(https:\/\/(?:cdn\.21shares\.com|www\.vaneck\.com|bitwiseinvestments\.eu|etc-group\.com|deutschedigitalassets\.com|coinshares\.com|kid\.ttmzero\.com|wisdomtree\.(?:com|eu)|dataspanapi\.wisdomtree\.com|ficas\.com|virtune\.(?:com|se)|nxtassets\.(?:com|de))[^"]*\.pdf)"/gi;
    let pdfMatch: RegExpExecArray | null;
    while ((pdfMatch = pdfLinkRe.exec(html)) !== null) {
      const pdfUrl = pdfMatch[1].replace(/&amp;/g, "&");
      validateUrlForFetch(pdfUrl);
      try {
        const headRes = await fetch(pdfUrl, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
        if (headRes.ok) {
          const provider = detectProviderFromUrl(pdfUrl);
          return { provider, factsheetUrl: pdfUrl };
        }
      } catch {
        /* PDF nicht erreichbar */
      }
    }

    // 2. Titelfeld-basierte URL-Konstruktion

    // VanEck: "VanEck Polkadot ETN" → KID_VanEck-Polkadot-ETN_en-CH.pdf
    if (/VanEck/i.test(productTitle) && /ETN/i.test(productTitle)) {
      const between = productTitle.replace(/VanEck\s+/i, "").replace(/\s+ETN.*$/i, "").trim();
      const slug = between.replace(/\s+/g, "-");
      const kidUrl = `https://www.vaneck.com/globalassets/home/ucits/documents/kids/KID_VanEck-${slug}-ETN_en-CH.pdf`;
      validateUrlForFetch(kidUrl);
      const headRes = await fetch(kidUrl, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
      if (headRes.ok) return { provider: "vaneck", factsheetUrl: kidUrl };
    }

    // Bitwise/ETC Group: "Bitwise Physical Bitcoin ETP" → fact-sheet-bitwise-physical-bitcoin-etp.pdf
    if (/Bitwise/i.test(productTitle) && /ETP/i.test(productTitle)) {
      const middle = productTitle.replace(/^Bitwise\s+/i, "").replace(/\s+ETP.*$/i, "").trim();
      const slug = middle.toLowerCase().replace(/\s+/g, "-");
      const candidates = [
        `https://bitwiseinvestments.eu/resources/fact_sheet/fact-sheet-bitwise-${slug}-etp.pdf`,
        `https://etc-group.com/resources/fact_sheet/fact-sheet-bitwise-${slug}-etp.pdf`,
      ];
      for (const fsUrl of candidates) {
        validateUrlForFetch(fsUrl);
        try {
          const headRes = await fetch(fsUrl, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
          if (headRes.ok) return { provider: "bitwise", factsheetUrl: fsUrl };
        } catch {
          continue;
        }
      }
    }

    // CoinShares: KID-URL mit ISIN (kid.ttmzero.com/coinshares/{ISIN}_latest_en_PL.pdf)
    if (/CoinShares/i.test(productTitle)) {
      const kidUrl = `https://kid.ttmzero.com/coinshares/${isin}_latest_en_PL.pdf`;
      validateUrlForFetch(kidUrl);
      try {
        const headRes = await fetch(kidUrl, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
        if (headRes.ok) return { provider: "coinshares", factsheetUrl: kidUrl };
      } catch {
        /* KID nicht erreichbar */
      }
    }

    // DDA: "DDA Crypto Select 10 ETP" → slct-dda-crypto-select-10-etp
    if (/DDA|Deutsche Digital Assets/i.test(productTitle)) {
      const lower = productTitle.toLowerCase();
      const ddaSlugs: Array<{ pattern: RegExp; slug: string }> = [
        { pattern: /crypto select 10|slct/i, slug: "slct-dda-crypto-select-10-etp" },
        { pattern: /physical bitcoin|xbti/i, slug: "xbti-dda-physical-bitcoin-etp" },
        { pattern: /physical ethereum|ieth/i, slug: "ieth-dda-physical-ethereum-etp" },
      ];
      for (const { pattern, slug } of ddaSlugs) {
        if (pattern.test(productTitle)) {
          const fsUrl = `https://deutschedigitalassets.com/wp-content/uploads/product_uploads/funds/etps/${slug}/Germany/Featured/${slug}_Factsheet-de.pdf`;
          validateUrlForFetch(fsUrl);
          const headRes = await fetch(fsUrl, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
          if (headRes.ok) return { provider: "dda", factsheetUrl: fsUrl };
        }
      }
    }

    // 3. Kein PDF – Konstituenten aus JustETF-Seite extrahieren (Index/Investment Focus)
    const constituents = extractConstituentsFromJustEtfHtml(html, productTitle);
    if (constituents && constituents.length > 0) {
      return { provider: "justetf", constituents, sourceUrl: url };
    }

    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─────────────────────────────────────────────
// Zentraler Resolver
// ─────────────────────────────────────────────

type ResolveResult =
  | { url: string; provider: Provider; constituents?: undefined; sourceUrl?: undefined }
  | { url?: undefined; provider: "justetf"; constituents: ConstituentWeight[]; sourceUrl: string };

async function resolveFactsheetUrl(isin: string): Promise<ResolveResult> {
  const entry = mapping[isin];
  const providerFromMapping = detectProvider(isin);

  // 1. Direkter Factsheet-URL aus Mapping (für alle Anbieter)
  if (entry?.factsheetUrl) {
    validateUrlForFetch(entry.factsheetUrl);
    return { url: entry.factsheetUrl, provider: providerFromMapping };
  }

  // 2. Anbieter-spezifische Discovery über Produktseite (wenn Mapping vorhanden)
  if (entry?.productPageUrl) {
    let discovered: string | null = null;

    if (providerFromMapping === "vaneck") {
      discovered = await discoverVanEckFactsheetUrl(entry.productPageUrl);
    } else if (providerFromMapping === "bitwise") {
      discovered = await discoverBitwiseFactsheetUrl(entry.productPageUrl);
    } else if (providerFromMapping === "dda") {
      discovered = await discoverDdaFactsheetUrl(entry.productPageUrl);
    } else {
      discovered = await discoverFactsheetFrom21SharesProductPage(entry.productPageUrl);
    }

    if (discovered) return { url: discovered, provider: providerFromMapping };
  }

  // 3. JustETF Discovery – für beliebige ISINs ohne Vor-Mapping
  const justEtf = await discoverFromJustEtf(isin);
  if (justEtf) {
    if ("factsheetUrl" in justEtf && justEtf.factsheetUrl) {
      return { url: justEtf.factsheetUrl, provider: justEtf.provider };
    }
    if ("constituents" in justEtf && justEtf.constituents) {
      return { provider: "justetf", constituents: justEtf.constituents, sourceUrl: justEtf.sourceUrl };
    }
  }

  // 4. 21Shares Fallback: Product-List-PDF und Factsheet-Listing
  const fromProductListing = await discoverFrom21SharesProductListing(isin);
  if (fromProductListing) return { url: fromProductListing, provider: "21shares" };

  const factsheetUrl = await discoverFrom21SharesFactsheetListing(isin);
  if (factsheetUrl) return { url: factsheetUrl, provider: "21shares" };

  throw new Error(
    `Keine Factsheet-URL für ISIN ${isin} gefunden. Die ISIN wurde bei JustETF und den unterstützten Anbietern nicht gefunden.`
  );
}

// ─────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function extractTickerFromFactsheetUrl(url: string): string | null {
  // 21Shares: Factsheet_HODL.pdf
  const m21 = url.match(/Factsheet_([A-Z]{2,10})\.pdf$/i);
  if (m21) return m21[1].toUpperCase();

  // Bitwise: fact-sheet-bitwise-physical-bitcoin-etp.pdf → aus Mapping suchen
  return null;
}

async function fetchWithRetries(url: string): Promise<Buffer> {
  let lastError: Error | null = null;
  for (let i = 0; i <= FETCH_RETRIES; i++) {
    try {
      return await downloadPdf(url);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < FETCH_RETRIES) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────
// Haupt-Workflow
// ─────────────────────────────────────────────

export async function runWorkflow(isin: string): Promise<WeightsResult | WorkflowError> {
  const normalizedIsin = normalizeIsin(isin);

  try {
    validateIsinFormat(normalizedIsin);
  } catch (e) {
    return {
      code: "INVALID_ISIN",
      message: e instanceof Error ? e.message : "Ungültiges ISIN",
    };
  }

  const now = new Date();

  const cached = await prisma.isinCache.findUnique({
    where: { isin: normalizedIsin },
  });

  if (cached && cached.expiresAt > now) {
    const constituents = JSON.parse(cached.weightsJson) as ConstituentWeight[];
    const cachedTicker = extractTickerFromFactsheetUrl(cached.sourcePdfUrl);
    const navUsd = cachedTicker ? await fetchNavFromApi(cachedTicker).catch(() => null) : null;
    return {
      isin: normalizedIsin,
      asOfDate: cached.asOfDate,
      constituents,
      navUsd,
      sourcePdfUrl: cached.sourcePdfUrl,
      cacheStatus: "HIT",
      fetchedAt: cached.fetchedAt.toISOString(),
    };
  }

  let sourcePdfUrl: string;
  let detectedProvider: Provider;
  let justEtfConstituents: ConstituentWeight[] | null = null;
  try {
    const resolved = await resolveFactsheetUrl(normalizedIsin);
    detectedProvider = resolved.provider;
    if ("constituents" in resolved && resolved.constituents) {
      justEtfConstituents = resolved.constituents;
      sourcePdfUrl = resolved.sourceUrl;
    } else {
      sourcePdfUrl = resolved.url;
    }
  } catch (e) {
    await prisma.fetchLog.create({
      data: {
        isin: normalizedIsin,
        attemptAt: now,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
        sourceUrl: null,
      },
    });
    return {
      code: "URL_NOT_FOUND",
      message: e instanceof Error ? e.message : "Factsheet-URL nicht gefunden",
    };
  }

  // JustETF-Konstituenten direkt verwenden (kein PDF)
  if (justEtfConstituents) {
    const cachedTicker = justEtfConstituents[0]?.name ?? null;
    const navUsd = cachedTicker ? await fetchNavFromApi(cachedTicker).catch(() => null) : null;
    const expiresAt = new Date(now.getTime() + CACHE_TTL_SUCCESS_MS);
    await prisma.isinCache.upsert({
      where: { isin: normalizedIsin },
      create: {
        isin: normalizedIsin,
        sourcePdfUrl,
        asOfDate: null,
        weightsJson: JSON.stringify(justEtfConstituents),
        fetchedAt: now,
        expiresAt,
        parseVersion: PARSE_VERSION,
        sha256Pdf: null,
      },
      update: {
        sourcePdfUrl,
        weightsJson: JSON.stringify(justEtfConstituents),
        fetchedAt: now,
        expiresAt,
      },
    });
    await prisma.fetchLog.create({
      data: {
        isin: normalizedIsin,
        attemptAt: now,
        status: "success",
        sourceUrl: sourcePdfUrl,
      },
    });
    return {
      isin: normalizedIsin,
      asOfDate: null,
      constituents: justEtfConstituents,
      navUsd,
      sourcePdfUrl,
      cacheStatus: "MISS",
      fetchedAt: now.toISOString(),
    };
  }

  let buffer: Buffer;
  let httpStatus: number | undefined;
  try {
    buffer = await fetchWithRetries(sourcePdfUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.fetchLog.create({
      data: {
        isin: normalizedIsin,
        attemptAt: now,
        status: "error",
        message: msg,
        httpStatus: undefined,
        sourceUrl: sourcePdfUrl,
      },
    });

    const negExpiry = new Date(now.getTime() + CACHE_TTL_FAILURE_MS);
    await prisma.isinCache.upsert({
      where: { isin: normalizedIsin },
      create: {
        isin: normalizedIsin,
        sourcePdfUrl,
        asOfDate: null,
        weightsJson: "[]",
        fetchedAt: now,
        expiresAt: negExpiry,
        parseVersion: PARSE_VERSION,
        sha256Pdf: null,
      },
      update: {
        weightsJson: "[]",
        fetchedAt: now,
        expiresAt: negExpiry,
      },
    });

    return {
      code: "FETCH_FAILED",
      message: msg,
      httpStatus,
    };
  }

  let text: string;
  try {
    text = await extractTextFromPdf(buffer);
  } catch (e) {
    await prisma.fetchLog.create({
      data: {
        isin: normalizedIsin,
        attemptAt: now,
        status: "error",
        message: e instanceof Error ? e.message : "PDF-Parse fehlgeschlagen",
        sourceUrl: sourcePdfUrl,
      },
    });
    return {
      code: "PARSE_FAILED",
      message: e instanceof Error ? e.message : "PDF-Text konnte nicht extrahiert werden",
    };
  }

  let asOfDate: string | null;
  let constituents: ConstituentWeight[];

  const parsed = parseFactsheetText(text, detectedProvider);
  asOfDate = parsed.asOfDate;
  constituents = parsed.constituents;

  const initialSum = constituents.reduce((s, c) => s + c.weight, 0);
  const needsOcr =
    constituents.length < 1 || initialSum < 90 || initialSum > 110;

  if (needsOcr) {
    // 21Shares: Ticker aus Product_List.pdf ermitteln und Holdings-API anfragen
    if (detectedProvider === "21shares" || detectedProvider === "unknown") {
      try {
        const ticker = await resolveTickerFromProductList(normalizedIsin);
        if (ticker) {
          const apiResult = await fetchConstituentsFromApi(ticker);
          if (apiResult && apiResult.constituents.length >= 1) {
            constituents = apiResult.constituents;
            asOfDate = apiResult.asOfDate ?? asOfDate;
          }
        }
      } catch {
        /* API-Fallback fehlgeschlagen, weiter mit OCR */
      }
    }

    // OCR als letzter Fallback
    const sumAfterApi = constituents.reduce((s, c) => s + c.weight, 0);
    if (constituents.length < 1 || sumAfterApi < 90 || sumAfterApi > 110) {
      try {
        const ocrResult = await extractTextViaOcr(buffer);
        const ocrConst = ocrResult.constituents;
        const ocrSum = ocrConst.reduce((s, c) => s + c.weight, 0);
        if (ocrConst.length >= 1 && ocrSum >= 90 && ocrSum <= 110) {
          constituents = ocrConst;
        }
      } catch {
        /* OCR fehlgeschlagen */
      }
    }
  }

  const finalSum = constituents.reduce((s, c) => s + c.weight, 0);
  if (constituents.length < 1 || finalSum < 90 || finalSum > 110) {
    const msg =
      constituents.length < 1
        ? "Keine Konstituenten extrahiert. Asset-Allokation könnte als Grafik vorliegen."
        : `Gewichtssumme ${finalSum.toFixed(2)}% liegt außerhalb der Toleranz (90–110%).`;
    await prisma.fetchLog.create({
      data: {
        isin: normalizedIsin,
        attemptAt: now,
        status: "error",
        message: msg,
        sourceUrl: sourcePdfUrl,
      },
    });
    return {
      code:
        constituents.length < 1 ? "INSUFFICIENT_DATA" : "WEIGHT_SUM_INVALID",
      message: msg,
    };
  }

  const sha = sha256(buffer);
  const expiry = new Date(now.getTime() + CACHE_TTL_SUCCESS_MS);

  await prisma.isinCache.upsert({
    where: { isin: normalizedIsin },
    create: {
      isin: normalizedIsin,
      sourcePdfUrl,
      asOfDate,
      weightsJson: JSON.stringify(constituents),
      fetchedAt: now,
      expiresAt: expiry,
      parseVersion: PARSE_VERSION,
      sha256Pdf: sha,
    },
    update: {
      sourcePdfUrl,
      asOfDate,
      weightsJson: JSON.stringify(constituents),
      fetchedAt: now,
      expiresAt: expiry,
      sha256Pdf: sha,
    },
  });

  await prisma.fetchLog.create({
    data: {
      isin: normalizedIsin,
      attemptAt: now,
      status: "success",
      message: `${constituents.length} Konstituenten (${detectedProvider})`,
      httpStatus: 200,
      sourceUrl: sourcePdfUrl,
    },
  });

  const navTicker = extractTickerFromFactsheetUrl(sourcePdfUrl);
  const navUsd = navTicker ? await fetchNavFromApi(navTicker).catch(() => null) : null;

  return {
    isin: normalizedIsin,
    asOfDate,
    constituents,
    navUsd,
    sourcePdfUrl,
    cacheStatus: "MISS",
    fetchedAt: now.toISOString(),
  };
}
