/**
 * 21Shares Holdings API (Xano-Backend der 21shares.com Produktseite)
 * Liefert exakte Gewichte aus der API, die auch das Balkendiagramm auf der Website befüllt.
 */

import { validateUrlForFetch } from "./allowlist";
import { USER_AGENT } from "./constants";
import type { ConstituentWeight } from "./parser";

const TICKER_CURRENCIES = new Set(["CHF", "EUR", "USD", "GBP", "SEK"]);

function extractAllCandidateTickers(block: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  function add(ticker: string) {
    if (!seen.has(ticker) && !TICKER_CURRENCIES.has(ticker) && ticker.length >= 3 && ticker.length <= 8) {
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

const HOLDINGS_API_BASE =
  "https://xvmd-hnpa-7dsw.n7c.xano.io/api:l2-Jhcoq/get_product_details_constituents";

const PRODUCT_LIST_PDF_URL =
  "https://cdn.21shares.com/uploads/current-documents/products/product-list/Product_List.pdf";

interface ApiConstituent {
  name: string;
  ticker: string;
  weight: number;
  price?: number;
  market_value?: number;
}

interface ApiProduct {
  ticker_name: string;
  constituents: ApiConstituent[];
}

export async function fetchConstituentsFromApi(
  ticker: string
): Promise<{ constituents: ConstituentWeight[]; asOfDate: string | null } | null> {
  const url = `${HOLDINGS_API_BASE}?name=${encodeURIComponent(ticker.toUpperCase())}`;
  validateUrlForFetch(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data: ApiProduct[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const product = data[0];
    if (!product.constituents || product.constituents.length === 0) return null;

    const rawSum = product.constituents.reduce((s, c) => s + (c.weight ?? 0), 0);
    if (rawSum <= 0) return null;

    const constituents: ConstituentWeight[] = product.constituents.map((c) => ({
      name: c.ticker || c.name,
      weight: Math.round((c.weight / rawSum) * 10000) / 100,
    }));

    const sum = constituents.reduce((s, c) => s + c.weight, 0);
    const factor = 100 / sum;
    const normalized = constituents.map((c) => ({
      name: c.name,
      weight: Math.round(c.weight * factor * 100) / 100,
    }));

    const today = new Date().toLocaleDateString("de-DE");
    return { constituents: normalized, asOfDate: today };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Ruft den aktuellen NAV (Net Asset Value) pro ETP-Einheit in USD ab.
 * Berechnet als Summe der market_value-Felder aller Konstituenten.
 */
export async function fetchNavFromApi(ticker: string): Promise<number | null> {
  const url = `${HOLDINGS_API_BASE}?name=${encodeURIComponent(ticker.toUpperCase())}`;
  validateUrlForFetch(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data: ApiProduct[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const product = data[0];
    if (!product.constituents || product.constituents.length === 0) return null;

    const nav = product.constituents.reduce(
      (sum, c) => sum + (c.market_value ?? 0),
      0
    );
    return nav > 0 ? Math.round(nav * 100) / 100 : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function resolveTickerFromProductList(isin: string): Promise<string | null> {
  validateUrlForFetch(PRODUCT_LIST_PDF_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(PRODUCT_LIST_PDF_URL, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const { text } = await pdfParse(buf);
    if (!text.includes(isin)) return null;
    const isinIdx = text.indexOf(isin);
    const block = text.slice(isinIdx, isinIdx + 300);
    const candidates = extractAllCandidateTickers(block);
    // Ersten funktionierenden Ticker per API-Aufruf ermitteln
    for (const ticker of candidates) {
      const url = `${HOLDINGS_API_BASE}?name=${encodeURIComponent(ticker)}`;
      validateUrlForFetch(url);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].constituents?.length > 0) {
          return ticker;
        }
      } catch { continue; }
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
