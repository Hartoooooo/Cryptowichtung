/**
 * Extraktion von Stichtag und Konstituenten-Gewichten aus Factsheet-Text
 * Unterstützte Anbieter: 21Shares, VanEck, Bitwise/ETC Group, DDA
 */

export type Provider = "21shares" | "vaneck" | "bitwise" | "dda" | "coinshares" | "wisdomtree" | "justetf" | "unknown";

// ─────────────────────────────────────────────
// Single-Asset Muster
// ─────────────────────────────────────────────

// Muster A: "backed by X (TICKER)" – Ticker aus Klammern
const SINGLE_ASSET_PATTERN_PARENS =
  /100\s*%\s*physically\s+backed\s+by\s+(?:[A-Za-z][A-Za-z ]{0,30}?\s+)?\(([A-Z]{2,10})\)/;
// Muster B: "backed by TICKER" – direkt großgeschriebenes Kürzel ohne Klammern
const SINGLE_ASSET_PATTERN_DIRECT =
  /100\s*%\s*physically\s+backed\s+by\s+([A-Z]{2,10})(?:\s|$|,|\()/;
// Muster C: VanEck-KID – "backed 100% by bitcoin", "fully backed by Bitcoin"
const SINGLE_ASSET_VANECK_BACKED =
  /(?:backed\s+100\s*%|100\s*%\s*backed|fully\s+backed)\s+by\s+(?:bitcoin|Bitcoin|Bitcoin\s*\(BTC\))/i;
// Muster D: VanEck-KID – "portfolio of Bitcoin/Ethereum/DOT", "secured by a portfolio\nof DOT"
// Hinweis: PDF-Textextraktion kann Zeilenumbrüche einfügen: "portfolio\nof DOT"
const SINGLE_ASSET_VANECK_PORTFOLIO =
  /(?:portfolio\s+of|secured by\s+(?:a\s+)?portfolio\s+of)\s+(Bitcoin|Ethereum|DOT|Polkadot|Solana|SOL|Cardano|ADA|XRP|Ripple)(?:\s|\.|$)/i;
// Muster E: Bitwise – "(TICKER) 100%" z.B. "Staked Ethereum (ETH) 100%", "Bitcoin (BTC) 100%"
const SINGLE_ASSET_TICKER_100 = /\(([A-Z]{2,10})\)\s+100\s*%?/;
// Muster F: Bitwise – "fully backed by ETH" / "physically backed by XRP"
const SINGLE_ASSET_BITWISE_BACKED = /(?:fully|physically)\s+backed\s+by\s+(?:the\s+)?([A-Z]{2,10})\b/i;
// Muster G: Bitwise – "100% XRP" / "100 % xrp" (Zusammensetzung: Gewicht zuerst)
const SINGLE_ASSET_100_PERCENT_TICKER = /100\s*%\s+([A-Za-z]{2,10})\b/i;
// Muster H: CoinShares KID – "Compass Crypto Reference Index Ethereum/Bitcoin/XRP/Cosmos"
const SINGLE_ASSET_COINSHARES_INDEX =
  /Compass\s+Crypto\s+Reference\s+Index\s+(Ethereum|Bitcoin|XRP|Solana|Cardano|Polkadot|Litecoin|Cosmos|ATOM|Tron|Sui)/i;

// ─────────────────────────────────────────────
// Stichtag-Muster (gilt für alle Anbieter)
// ─────────────────────────────────────────────

const AS_OF_PATTERNS = [
  /[Aa]s of\s+(\d{1,2}\s+[A-Za-z]+,?\s*\d{4})/,
  /[Aa]s of\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
  /[Ss]tand\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
  /[Dd]atum[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
  /[Dd]ate[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
  /[Rr]ebalancing[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
  /[Pp]ortfolio\s+(?:date|as of)[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
];

// ─────────────────────────────────────────────
// Gewicht-Regex
// ─────────────────────────────────────────────

const WEIGHT_REGEX =
  /([A-Za-z0-9][A-Za-z0-9 \-.()]{1,40})\s+(\d{1,3}(?:[.,]\d{1,4})?)\s*%?/g;

// ─────────────────────────────────────────────
// Provider-spezifische Section-Header
// ─────────────────────────────────────────────

const SECTION_HEADERS_BY_PROVIDER: Record<Provider, string[]> = {
  "21shares": [
    "ASSET ALLOCATION",
    "Asset Allocation",
    "INDEX COMPOSITION",
    "Index Composition",
    "PORTFOLIO",
    "Portfolio",
    "WEIGHTING",
    "Constituents",
  ],
  vaneck: [
    "Index Composition",
    "INDEX COMPOSITION",
    "Portfolio Composition",
    "PORTFOLIO COMPOSITION",
    "Asset Allocation",
    "ASSET ALLOCATION",
    "Holdings",
    "HOLDINGS",
    "Constituents",
    "CONSTITUENTS",
    "Top Holdings",
  ],
  bitwise: [
    "Zusammensetzung",
    "Index-Zusammensetzung",
    "Indexzusammensetzung",
    "Index Composition",
    "INDEX COMPOSITION",
    "Asset Allocation",
    "ASSET ALLOCATION",
    "Portfolio",
    "PORTFOLIO",
    "Holdings",
    "HOLDINGS",
    "Constituents",
    "CONSTITUENTS",
    "Underlying Assets",
  ],
  coinshares: [
    "Index Composition",
    "INDEX COMPOSITION",
    "Asset Allocation",
    "Underlying asset",
    "Holdings",
    "HOLDINGS",
  ],
  wisdomtree: [
    "Index Composition",
    "Asset Allocation",
    "Underlying",
    "Holdings",
    "HOLDINGS",
  ],
  justetf: [
    "ASSET ALLOCATION",
    "Asset Allocation",
    "INDEX COMPOSITION",
    "Index Composition",
    "Portfolio",
    "Holdings",
  ],
  dda: [
    "Index Constituents",
    "INDEX CONSTITUENTS",
    "Asset Allocation",
    "ASSET ALLOCATION",
    "Portfolio Allocation",
    "PORTFOLIO ALLOCATION",
    "Holdings",
    "HOLDINGS",
    "Constituents",
    "CONSTITUENTS",
    "Index Composition",
    "Crypto Allocation",
  ],
  unknown: [
    "ASSET ALLOCATION",
    "Asset Allocation",
    "INDEX COMPOSITION",
    "Index Composition",
    "PORTFOLIO",
    "Portfolio",
    "WEIGHTING",
    "Constituents",
    "Holdings",
    "HOLDINGS",
  ],
};

// ─────────────────────────────────────────────
// Blacklist (gilt für alle Anbieter)
// ─────────────────────────────────────────────

const BLACKLIST_KEYWORDS = [
  "TER",
  "fee",
  "management",
  "total",
  "performance",
  "volatility",
  "isin",
  "currency",
  "expense",
  "Ongoing",
  "Charges",
  "of",
  "by",
  "Since",
  "Allocation",
  "Asset",
  "Underlying",
  "Percentage",
  "Benchmark",
  "Physically",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Days",
  "Months",
  "Year",
  "YTD",
  "inception",
  "Change",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "2022",
  "2023",
  "2024",
  "2025",
  "2026",
];

const MAX_CONSTITUENTS = 20;
const WEIGHT_SUM_MIN = 90;
const WEIGHT_SUM_MAX = 110;

export interface ConstituentWeight {
  name: string;
  weight: number;
}

export interface ParsedFactsheet {
  asOfDate: string | null;
  constituents: ConstituentWeight[];
}

function normalizeWeightValue(val: string): number {
  const cleaned = val.replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function isBlacklisted(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return BLACKLIST_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function extractAsOfDate(text: string): string | null {
  for (const pattern of AS_OF_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1].trim().replace(/\s+/g, " ");
  }
  return null;
}

function extractRelevantSection(text: string, provider: Provider): string {
  const headers = SECTION_HEADERS_BY_PROVIDER[provider] ?? SECTION_HEADERS_BY_PROVIDER["unknown"];

  for (const header of headers) {
    const idx = text.indexOf(header);
    if (idx >= 0) {
      const start = idx + header.length;
      const rest = text.slice(start, start + 2500);
      const nextSection = rest.search(
        /\n\s*(TRADING|FUNDAMENTALS|RISK|HISTORICAL|ABOUT|CONTACT|DISCLAIMER|21shares\.com|vaneck\.com|etc-group\.com|bitwiseinvestments\.eu|deutschedigitalassets\.com)/i
      );
      const block =
        nextSection >= 0 ? rest.slice(0, nextSection) : rest.slice(0, 1500);
      return block;
    }
  }
  return text;
}

const KNOWN_CRYPTO_TICKERS = new Set([
  "BTC", "BITCOIN", "ETH", "ETHEREUM", "XRP", "RIPPLE", "BNB", "BINANCE",
  "SOL", "SOLANA", "ADA", "CARDANO", "DOGE", "DOGECOIN", "AVAX", "AVALANCHE",
  "DOT", "POLKADOT", "MATIC", "POLYGON", "LINK", "CHAINLINK", "UNI", "UNISWAP",
  "LTC", "LITECOIN", "ATOM", "COSMOS", "NEAR", "APT", "APTOS", "ARB", "ARBITRUM",
  "OP", "OPTIMISM", "SUI", "INJ", "INJECTIVE", "TIA", "CELESTIA", "STX", "STACKS",
  "FIL", "FILECOIN", "ICP", "HBAR", "HEDERA", "VET", "VECHAIN", "ALGO", "ALGORAND",
  "XLM", "STELLAR", "AAVE", "MKR", "MAKER", "CRV", "CURVE", "LDO", "LIDO",
  "TON", "TONCOIN", "SHIB", "TRX", "TRON", "BCH", "BITCOIN CASH",
  // VanEck Crypto Leaders Index Bestandteile
  "VCLD",
  // Bitwise DA20 häufige Bestandteile
  "DA20",
]);

// Rohstoffe/Edelmetalle in Index-Zusammensetzung (z.B. Bitwise Bitcoin+Gold Produkte)
const KNOWN_COMMODITY_ASSETS = new Set([
  "GOLD", "XAU", "SILVER", "XAG", "PHYSICAL GOLD", "PHYSICAL SILVER",
]);

function extractConstituentsFromBlock(
  block: string,
  requireTicker: boolean
): ConstituentWeight[] {
  const matches: Array<{ name: string; weight: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(
    WEIGHT_REGEX.source,
    WEIGHT_REGEX.flags.includes("g") ? "g" : ""
  );

  while ((m = re.exec(block)) !== null) {
    const name = m[1].trim();
    const weight = normalizeWeightValue(m[2]);

    if (isBlacklisted(name)) continue;
    if (weight <= 0 || weight > 100) continue;
    const nameUpper = name.toUpperCase().trim();
    const looksLikeTicker =
      /^[A-Z]{2,10}$/.test(nameUpper) ||
      KNOWN_CRYPTO_TICKERS.has(nameUpper) ||
      [...KNOWN_CRYPTO_TICKERS].some((t) => nameUpper.includes(t));
    const isAllowedCommodity =
      KNOWN_COMMODITY_ASSETS.has(nameUpper) ||
      ["GOLD", "XAU", "SILVER", "XAG"].some((x) => nameUpper.includes(x));
    if (requireTicker && !looksLikeTicker && !isAllowedCommodity && name.length > 12) continue;

    matches.push({ name, weight });
  }

  matches.sort((a, b) => b.weight - a.weight);
  return matches.slice(0, MAX_CONSTITUENTS);
}

const SINGLE_ASSET_BLACKLIST = new Set([
  "the", "underlying", "digital", "assets", "top", "index",
]);

function extractSingleAsset(text: string): ConstituentWeight[] {
  // Priorität 1: Ticker aus Klammern extrahieren, z.B. "backed by Binance Coin (BNB)" → BNB
  const mParens = text.match(SINGLE_ASSET_PATTERN_PARENS);
  if (mParens) {
    const ticker = mParens[1];
    if (ticker.length >= 2 && ticker.length <= 10) return [{ name: ticker, weight: 100 }];
  }

  // Priorität 2: Direkt großgeschriebenes Kürzel, z.B. "backed by NEAR Protocol" → NEAR
  const mDirect = text.match(SINGLE_ASSET_PATTERN_DIRECT);
  if (mDirect) {
    const ticker = mDirect[1];
    if (!SINGLE_ASSET_BLACKLIST.has(ticker.toLowerCase()) && ticker.length >= 2 && ticker.length <= 10) {
      return [{ name: ticker, weight: 100 }];
    }
  }

  // Priorität 3: VanEck – "backed 100% by bitcoin", "fully backed by Bitcoin"
  if (SINGLE_ASSET_VANECK_BACKED.test(text)) return [{ name: "BTC", weight: 100 }];

  // Priorität 4: VanEck-KID – "portfolio of Bitcoin/Ethereum/DOT", "secured by a portfolio of DOT"
  const mPortfolio = text.match(SINGLE_ASSET_VANECK_PORTFOLIO);
  if (mPortfolio) {
    const asset = mPortfolio[1].toUpperCase();
    const nameToTicker: Record<string, string> = {
      BITCOIN: "BTC", ETHEREUM: "ETH", DOT: "DOT", POLKADOT: "DOT",
      SOLANA: "SOL", SOL: "SOL", CARDANO: "ADA", ADA: "ADA", XRP: "XRP", RIPPLE: "XRP",
    };
    const ticker = nameToTicker[asset] ?? (/^[A-Z]{2,6}$/.test(asset) ? asset : null);
    if (ticker) return [{ name: ticker, weight: 100 }];
  }

  // Priorität 5: Bitwise – "(TICKER) 100%" z.B. "Staked Ethereum (ETH) 100%", "Ethereum (ETH) 100%"
  const mTicker100 = text.match(SINGLE_ASSET_TICKER_100);
  if (mTicker100) {
    const ticker = mTicker100[1];
    if (
      !SINGLE_ASSET_BLACKLIST.has(ticker.toLowerCase()) &&
      ticker.length >= 2 &&
      ticker.length <= 10 &&
      KNOWN_CRYPTO_TICKERS.has(ticker)
    ) {
      return [{ name: ticker, weight: 100 }];
    }
  }

  // Priorität 6: Bitwise – "fully backed by ETH", "physically backed by XRP"
  const mBitwiseBacked = text.match(SINGLE_ASSET_BITWISE_BACKED);
  if (mBitwiseBacked) {
    const ticker = mBitwiseBacked[1].toUpperCase();
    if (
      !SINGLE_ASSET_BLACKLIST.has(ticker.toLowerCase()) &&
      KNOWN_CRYPTO_TICKERS.has(ticker)
    ) {
      return [{ name: ticker, weight: 100 }];
    }
  }

  // Priorität 7: CoinShares KID – "Compass Crypto Reference Index Ethereum"
  const mCoinshares = text.match(SINGLE_ASSET_COINSHARES_INDEX);
  if (mCoinshares) {
    const asset = mCoinshares[1].toUpperCase();
    const nameToTicker: Record<string, string> = {
      BITCOIN: "BTC",
      ETHEREUM: "ETH",
      XRP: "XRP",
      SOLANA: "SOL",
      CARDANO: "ADA",
      POLKADOT: "DOT",
      LITECOIN: "LTC",
      COSMOS: "ATOM",
      ATOM: "ATOM",
      TRON: "TRX",
      TRX: "TRX",
      SUI: "SUI",
    };
    const ticker = nameToTicker[asset];
    if (ticker) return [{ name: ticker, weight: 100 }];
  }

  // Priorität 8: Bitwise – "100% XRP" / "100 % xrp" (Zusammensetzung, Gewicht zuerst)
  for (const m of text.matchAll(new RegExp(SINGLE_ASSET_100_PERCENT_TICKER.source, "gi"))) {
    const ticker = m[1].toUpperCase();
    if (
      !SINGLE_ASSET_BLACKLIST.has(ticker.toLowerCase()) &&
      KNOWN_CRYPTO_TICKERS.has(ticker)
    ) {
      return [{ name: ticker, weight: 100 }];
    }
  }

  return [];
}

// ─────────────────────────────────────────────
// VanEck-spezifische Extraktion
// ─────────────────────────────────────────────

/**
 * VanEck ETNs sind fast ausschließlich Single-Asset.
 * Der Crypto Leaders ETN (VCLD) verwendet einen Index, dessen Gewichte
 * im Factsheet als Tabelle mit "Asset" + "Weight %" erscheinen.
 */
function extractVanEckConstituents(text: string): ConstituentWeight[] {
  // Single-Asset zuerst prüfen
  const single = extractSingleAsset(text);
  if (single.length > 0) return single;

  // Explizite Tabellenzeilen: "Bitcoin 45.00" oder "BTC 45.00%"
  const tablePattern = /\b([A-Z][A-Za-z0-9 ]{1,20})\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
  const matches: ConstituentWeight[] = [];
  let m: RegExpExecArray | null;
  while ((m = tablePattern.exec(text)) !== null) {
    const name = m[1].trim();
    const weight = normalizeWeightValue(m[2]);
    if (isBlacklisted(name) || weight <= 0 || weight > 100) continue;
    const upper = name.toUpperCase();
    const isCrypto = KNOWN_CRYPTO_TICKERS.has(upper) || [...KNOWN_CRYPTO_TICKERS].some((t) => upper.includes(t));
    const isCommodity = KNOWN_COMMODITY_ASSETS.has(upper) || ["GOLD", "XAU", "SILVER", "XAG"].some((x) => upper.includes(x));
    if (isCrypto || isCommodity) matches.push({ name, weight });
  }
  if (matches.length > 0) {
    matches.sort((a, b) => b.weight - a.weight);
    return matches.slice(0, MAX_CONSTITUENTS);
  }

  return extractConstituentsFromBlock(extractRelevantSection(text, "vaneck"), false);
}

// ─────────────────────────────────────────────
// Bitwise-spezifische Extraktion
// ─────────────────────────────────────────────

/**
 * Bitwise Single-Asset ETPs: "100% physically backed by Bitcoin (BTC)"
 * Bitwise DA20 (MSCI Digital Assets Select 20): Tabelle mit Ticker + Weight
 */
function extractBitwiseConstituents(text: string): ConstituentWeight[] {
  const single = extractSingleAsset(text);
  if (single.length > 0) return single;

  return extractConstituentsFromBlock(extractRelevantSection(text, "bitwise"), false);
}

// ─────────────────────────────────────────────
// DDA-spezifische Extraktion
// ─────────────────────────────────────────────

/**
 * DDA SLCT (Crypto Select 10): Tabelle mit Krypto-Ticker und Gewichten.
 * Format typischerweise: "Bitcoin BTC 45.23%" oder "BTC 45.23%"
 */
function extractDdaConstituents(text: string): ConstituentWeight[] {
  const single = extractSingleAsset(text);
  if (single.length > 0) return single;

  // Spezifisches DDA-Muster: Zeilen mit "Name Ticker Weight%"
  // z.B. "Bitcoin BTC 45.23" oder "BTC 45.23%"
  const ddaPattern =
    /\b([A-Z][A-Za-z0-9 ]{1,25})\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
  const matches: ConstituentWeight[] = [];
  const section = extractRelevantSection(text, "dda");
  let m: RegExpExecArray | null;

  while ((m = ddaPattern.exec(section)) !== null) {
    const name = m[1].trim();
    const weight = normalizeWeightValue(m[2]);
    if (isBlacklisted(name) || weight <= 0 || weight > 100) continue;
    const upper = name.toUpperCase();
    const isCrypto =
      /^[A-Z]{2,10}$/.test(upper) ||
      KNOWN_CRYPTO_TICKERS.has(upper) ||
      [...KNOWN_CRYPTO_TICKERS].some((t) => upper.includes(t));
    const isCommodity = KNOWN_COMMODITY_ASSETS.has(upper) || ["GOLD", "XAU", "SILVER", "XAG"].some((x) => upper.includes(x));
    if (isCrypto || isCommodity) matches.push({ name, weight });
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.weight - a.weight);
    return matches.slice(0, MAX_CONSTITUENTS);
  }

  return extractConstituentsFromBlock(section, false);
}

// ─────────────────────────────────────────────
// Allgemeine Extraktion (21Shares / unbekannt)
// ─────────────────────────────────────────────

// Vollständige Asset-Namen (gemischte Groß-/Kleinschreibung) nach "physically backed by"
const COINSHARES_BACKED_BY_NAME_TO_TICKER: Record<string, string> = {
  cosmos: "ATOM",
  bitcoin: "BTC",
  ethereum: "ETH",
  xrp: "XRP",
  solana: "SOL",
  cardano: "ADA",
  polkadot: "DOT",
  litecoin: "LTC",
  avalanche: "AVAX",
  polygon: "MATIC",
  chainlink: "LINK",
  "near protocol": "NEAR",
  toncoin: "TON",
  tron: "TRX",
  sui: "SUI",
};

const COINSHARES_BACKED_PATTERN =
  /(?:100\s*%\s*)?physically\s+backed\s+by\s+(cosmos|bitcoin|ethereum|xrp|solana|cardano|polkadot|litecoin|avalanche|polygon|chainlink|near\s+protocol|toncoin|tron|sui)(?:\s*\([A-Z]{2,10}\))?/i;

function extractCoinsharesConstituents(text: string): ConstituentWeight[] {
  const single = extractSingleAsset(text);
  if (single.length > 0) return single;

  // Fallback: "physically backed by Cosmos" (gemischte Schreibweise, ohne Klammern)
  const mBacked = text.match(COINSHARES_BACKED_PATTERN);
  if (mBacked) {
    const ticker = COINSHARES_BACKED_BY_NAME_TO_TICKER[mBacked[1].toLowerCase()];
    if (ticker) return [{ name: ticker, weight: 100 }];
  }

  return extractConstituentsFromBlock(extractRelevantSection(text, "coinshares"), false);
}

function extractWisdomtreeConstituents(text: string): ConstituentWeight[] {
  const single = extractSingleAsset(text);
  if (single.length > 0) return single;
  return extractConstituentsFromBlock(extractRelevantSection(text, "wisdomtree"), false);
}

function extractConstituents(text: string, provider: Provider): ConstituentWeight[] {
  switch (provider) {
    case "vaneck":
      return extractVanEckConstituents(text);
    case "bitwise":
      return extractBitwiseConstituents(text);
    case "dda":
      return extractDdaConstituents(text);
    case "coinshares":
      return extractCoinsharesConstituents(text);
    case "wisdomtree":
      return extractWisdomtreeConstituents(text);
    default: {
      const single = extractSingleAsset(text);
      if (single.length > 0) return single;
      return extractConstituentsFromBlock(extractRelevantSection(text, provider), false);
    }
  }
}

function normalizeWeightsTo100(constituents: ConstituentWeight[]): ConstituentWeight[] {
  const sum = constituents.reduce((s, c) => s + c.weight, 0);
  if (sum < WEIGHT_SUM_MIN || sum > WEIGHT_SUM_MAX) {
    return constituents;
  }
  const factor = 100 / sum;
  return constituents.map((c) => ({
    name: c.name,
    weight: Math.round(c.weight * factor * 100) / 100,
  }));
}

// ─────────────────────────────────────────────
// Full-Text Single-Coin Fallback
// ─────────────────────────────────────────────

/**
 * Jeder Eintrag: [Regex-Pattern, kanonischer Ticker].
 * Längere/spezifischere Muster stehen VOR kürzeren, damit z.B.
 * "Bitcoin Cash" nicht als "Bitcoin" und "Cash" gezählt wird.
 * Full-Names sind case-insensitive; Ticker-Patterns case-sensitive (Großbuchstaben).
 */
const FULL_TEXT_COIN_MAP: Array<[RegExp, string]> = [
  [/\bbitcoin\s+cash\b/i,     "BCH"],
  [/\bnear\s+protocol\b/i,    "NEAR"],
  [/\binternet\s+computer\b/i,"ICP"],
  [/\bbitcoin\b/i,            "BTC"],
  [/\bBTC\b/,                 "BTC"],
  [/\bethereum\b/i,           "ETH"],
  [/\bETH\b/,                 "ETH"],
  [/\bcosmos\b/i,             "ATOM"],
  [/\bATOM\b/,                "ATOM"],
  [/\bripple\b/i,             "XRP"],
  [/\bXRP\b/,                 "XRP"],
  [/\bsolana\b/i,             "SOL"],
  [/\bSOL\b/,                 "SOL"],
  [/\bcardano\b/i,            "ADA"],
  [/\bADA\b/,                 "ADA"],
  [/\bpolkadot\b/i,           "DOT"],
  [/\bDOT\b/,                 "DOT"],
  [/\blitecoin\b/i,           "LTC"],
  [/\bLTC\b/,                 "LTC"],
  [/\bavalanche\b/i,          "AVAX"],
  [/\bAVAX\b/,                "AVAX"],
  [/\bpolygon\b/i,            "MATIC"],
  [/\bMATIC\b/,               "MATIC"],
  [/\bchainlink\b/i,          "LINK"],
  [/\bLINK\b/,                "LINK"],
  [/\bdogecoin\b/i,           "DOGE"],
  [/\bDOGE\b/,                "DOGE"],
  [/\btoncoin\b/i,            "TON"],
  [/\bhedera\b/i,             "HBAR"],
  [/\bHBAR\b/,                "HBAR"],
  [/\balgorand\b/i,           "ALGO"],
  [/\bALGO\b/,                "ALGO"],
  [/\bstellar\b/i,            "XLM"],
  [/\bXLM\b/,                 "XLM"],
  [/\baptos\b/i,              "APT"],
  [/\bAPT\b/,                 "APT"],
  [/\bfilecoin\b/i,           "FIL"],
  [/\bFIL\b/,                 "FIL"],
  [/\binjective\b/i,          "INJ"],
  [/\bINJ\b/,                 "INJ"],
  [/\bcelestia\b/i,           "TIA"],
  [/\bTIA\b/,                 "TIA"],
  [/\bnear\b/i,               "NEAR"],
  [/\bNEAR\b/,                "NEAR"],
  [/\bsui\b/i,                "SUI"],
  [/\bSUI\b/,                 "SUI"],
  [/\btron\b/i,               "TRX"],
  [/\bTRX\b/,                 "TRX"],
  [/\baave\b/i,               "AAVE"],
  [/\bAAVE\b/,                "AAVE"],
];

/**
 * Scannt den gesamten Factsheet-Text nach bekannten Coin-Namen/-Tickern.
 * Wird genau EIN einziger Coin erkannt → 100% zugewiesen.
 * Bei mehreren Coins (Multi-Asset) wird [] zurückgegeben.
 */
function extractSingleCoinFromFullText(text: string): ConstituentWeight[] {
  const foundTickers = new Set<string>();
  for (const [pattern, ticker] of FULL_TEXT_COIN_MAP) {
    if (pattern.test(text)) {
      foundTickers.add(ticker);
    }
  }
  if (foundTickers.size === 1) {
    return [{ name: [...foundTickers][0], weight: 100 }];
  }
  return [];
}

export function parseFactsheetText(
  text: string,
  provider: Provider = "unknown"
): ParsedFactsheet {
  const asOfDate = extractAsOfDate(text);
  let constituents = extractConstituents(text, provider);
  constituents = normalizeWeightsTo100(constituents);

  // Finaler Fallback: wenn kein gültiges Ergebnis → gesamten Text nach
  // genau einem Coin scannen und direkt 100% zuweisen.
  const sum = constituents.reduce((s, c) => s + c.weight, 0);
  if (constituents.length === 0 || sum < WEIGHT_SUM_MIN || sum > WEIGHT_SUM_MAX) {
    const singleFromText = extractSingleCoinFromFullText(text);
    if (singleFromText.length > 0) {
      constituents = singleFromText;
    }
  }

  return { asOfDate, constituents };
}
