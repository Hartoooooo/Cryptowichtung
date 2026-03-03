# Coinwichtung – Vollständige Workflow-Analyse und C#-Referenzimplementierung

## 1. Übersicht

Der **Wichtung-Workflow** extrahiert die Krypto-Asset-Gewichtungen („Konstituenten“) aus ETF/ETP-Factsheets. Aus einer ISIN wird über mehrere Stufen eine Liste von `{ name, weight }` ermittelt, die zusammen ~100% ergeben.

---

## 2. Architekturüberblick

```
Eingabe: ISIN (string), optional productName (string)
         ↓
    Cache-Check (Supabase IsinCache)
         ↓ (MISS)
    URL-Resolution (Mapping → Provider → JustETF)
         ↓
    Quick-Paths: Excel-Name / JustETF-Konstituenten / Produktname → 100% Single-Asset
         ↓ (falls PDF nötig)
    PDF-Download (mit Retries)
         ↓
    Text-Extraktion (pdf-parse → pdfjs-dist)
         ↓
    Parser (provider-spezifisch)
         ↓
    Fallbacks: Holdings-API / OCR (Tesseract)
         ↓
    Validierung (Summe 90–110%, ≥1 Konstituent)
         ↓
    Cache-Update, FetchLog, NAV-Abruf
         ↓
Ausgabe: WeightsResult { isin, asOfDate, constituents, navUsd, sourcePdfUrl, cacheStatus, fetchedAt }
```

---

## 3. Detaillierte Workflow-Schritte

### 3.1 Eingabe und Normalisierung

| Schritt | Beschreibung |
|--------|--------------|
| Input | `isin` (Pflicht), `productName` (optional, z.B. aus Excel „Instruments Short Name“) |
| Normalisierung | ISIN: `Trim`, `ToUpper`, Leerzeichen entfernen |
| Validierung | Regex: `^[A-Z]{2}[A-Z0-9]{9}[0-9]$` (12 Zeichen) |
| Fehler | `INVALID_ISIN` wenn Format ungültig |

### 3.2 Cache-Check

| Schritt | Beschreibung |
|--------|--------------|
| Tabelle | `IsinCache` (isin, sourcePdfUrl, asOfDate, weightsJson, fetchedAt, expiresAt, parseVersion, sha256Pdf) |
| Bedingung | `expiresAt > now` |
| Bei HIT | `weightsJson` parsen, NAV optional per Ticker abrufen, sofort zurückgeben |
| Cache-Status | `HIT` oder `MISS` |

### 3.3 Quick-Path: Excel-Produktname

Wenn `productName` übergeben wird und **genau ein** bekanntes Coin-Asset darin vorkommt:

- **Coin-Erkennung** aus Produktnamen (z.B. „21Shares Bitcoin ETP“ → BTC)
- **Priorität**: Längere Namen vor kürzeren („Bitcoin Cash“ vor „Bitcoin“)
- Ergebnis: `[{ name: ticker, weight: 100 }]`
- **Kein PDF-Download**, direkt in Cache schreiben und zurückgeben

### 3.4 URL-Resolution (Factsheet-URL ermitteln)

**Reihenfolge der Quellen:**

1. **Direktes Mapping** (`isin-mapping.json`): `factsheetUrl` falls vorhanden
2. **Produktseite** (falls `productPageUrl`): provider-spezifischer Scraper
   - VanEck: HTML → Factsheet-PDF-Link
   - Bitwise: HTML → etc-group.com / bitwiseinvestments.eu
   - DDA: HTML → deutschedigitalassets.com (bevorzugt englisch)
   - 21Shares: HTML → cdn.21shares.com Factsheet
3. **JustETF** (`justetf.com/en/etf-profile.html?isin=...`)
   - PDF-Links von erlaubten Anbietern
   - URL-Konstruktion aus Produkttitel (VanEck, Bitwise, CoinShares, DDA)
   - Fallback: Konstituenten aus HTML (Index, Investment Focus) → 100% Single-Asset
4. **21Shares Fallback**: Product-List-PDF, Factsheet-Listing

Bei Erfolg: `{ url, provider, productName? }` oder `{ provider: "justetf", constituents, sourceUrl }`.

Bei JustETF-Konstituenten: Direkt zurückgeben, kein PDF.

### 3.5 Quick-Path: Produktname (ohne Excel)

Wenn durch URL-Resolution ein `productName` bekannt ist und darin genau ein Coin vorkommt:

- Ein-Konstituent: `[{ name: ticker, weight: 100 }]`
- Kein PDF-Download

### 3.6 PDF-Download

| Schritt | Beschreibung |
|--------|--------------|
| URL | Aus URL-Resolution |
| Retries | 2 (insgesamt 3 Versuche, 1s Pause dazwischen) |
| Timeout | 30s |
| Max Size | 15 MB |
| User-Agent | `Coinwichtung/1.0 (+https://github.com/coinwichtung; fact sheet parser)` |
| Fehler | `FETCH_FAILED`; bei CoinShares → JustETF-Fallback |

### 3.7 PDF-Text-Extraktion

1. **pdf-parse** (Node)
2. Fallback: **pdfjs-dist** (Seite für Seite, TextContent)

Bei Fehlschlag: CoinShares → JustETF-Fallback; sonst `PARSE_FAILED`.

### 3.8 Parser (provider-spezifisch)

**Gemeinsam:**

- **Stichtag (asOfDate)**: Patterns wie `As of DD.MM.YYYY`, `Stand DD.MM.YYYY`, `Date:`, `Datum:`, `Rebalancing:`, etc.
- **Blacklist**: z.B. TER, fee, management, total, performance, Monatsnamen, etc.
- **Gewicht-Summe**: 90–110% gültig; bei 90–110% → Normalisierung auf 100%

**Provider-spezifisch:**

| Provider | Besonderheiten |
|----------|----------------|
| VanEck | Single-Asset: „backed 100% by bitcoin“, „portfolio of Bitcoin“; Tabelle für VCLD |
| Bitwise | Single-Asset: „(ETH) 100%“, „fully backed by XRP“; Tabellen für DA20 |
| DDA | Single-Asset; Tabellen: „Bitcoin BTC 45.23%“ |
| CoinShares | „physically backed by Cosmos“, Compass Crypto Reference Index |
| WisdomTree | Single-Asset; Block-Extraktion |
| 21Shares/unknown | Block-Extraktion, Section-Header: ASSET ALLOCATION, INDEX COMPOSITION, WEIGHTING, etc. |

**Gewicht-Regex:** `([A-Za-z0-9][A-Za-z0-9 \-.()]{1,40})\s+(\d{1,3}(?:[.,]\d{1,4})?)\s*%?` (global)

### 3.9 Fallbacks bei ungültigem Parse

Wenn `constituents.Length < 1` oder Summe \< 90% oder \> 110%:

1. **21Shares / unknown**: Holdings-API (Xano) mit Ticker aus Product-List-PDF
2. **OCR** (Tesseract): Seite mit „ASSET ALLOCATION“ finden, als Bild rendern, OCR ausführen, Parser anwenden
3. **CoinShares**: JustETF-Seite parsen (Index, Investment Focus, Produkttitel)

### 3.10 Validierung

- ≥ 1 Konstituent
- Summe: 90% ≤ sum ≤ 110%

Sonst: `INSUFFICIENT_DATA` oder `WEIGHT_SUM_INVALID`.

### 3.11 Abschluss

- Cache schreiben (24h TTL bei Erfolg, 30min bei Fehler)
- FetchLog schreiben
- NAV optional per `extractTickerFromFactsheetUrl` → Holdings-API abrufen

---

## 4. Datenstrukturen

### WeightsResult

```json
{
  "isin": "CH0445689208",
  "asOfDate": "31.12.2024",
  "constituents": [
    { "name": "BTC", "weight": 100 }
  ],
  "navUsd": 42.15,
  "sourcePdfUrl": "https://cdn.21shares.com/...",
  "cacheStatus": "HIT",
  "fetchedAt": "2024-03-03T12:00:00.000Z"
}
```

### WorkflowError

```json
{
  "code": "URL_NOT_FOUND",
  "message": "Keine Factsheet-URL gefunden",
  "httpStatus": 404
}
```

### ConstituentWeight

```json
{ "name": "BTC", "weight": 100 }
```

---

## 5. Konstanten

| Konstante | Wert |
|-----------|------|
| CACHE_TTL_SUCCESS_MS | 24 * 60 * 60 * 1000 (24h) |
| CACHE_TTL_FAILURE_MS | 30 * 60 * 1000 (30min) |
| MAX_PDF_SIZE_BYTES | 15 * 1024 * 1024 (15 MB) |
| FETCH_TIMEOUT_MS | 30000 |
| FETCH_RETRIES | 2 |
| WEIGHT_SUM_MIN | 90 |
| WEIGHT_SUM_MAX | 110 |
| MAX_CONSTITUENTS | 20 |

---

## 6. C# Referenzimplementierung

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Coinwichtung
{
    public class ConstituentWeight
    {
        public string Name { get; set; } = "";
        public double Weight { get; set; }
    }

    public class WeightsResult
    {
        public string Isin { get; set; } = "";
        public string? AsOfDate { get; set; }
        public List<ConstituentWeight> Constituents { get; set; } = new();
        public double? NavUsd { get; set; }
        public string SourcePdfUrl { get; set; } = "";
        public string CacheStatus { get; set; } = "MISS";
        public string FetchedAt { get; set; } = "";
    }

    public class WorkflowError
    {
        public string Code { get; set; } = "";
        public string Message { get; set; } = "";
        public int? HttpStatus { get; set; }
    }

    public class WorkflowEngine
    {
        private static readonly string[] BLACKLIST_KEYWORDS = {
            "TER", "fee", "management", "total", "performance", "volatility",
            "isin", "currency", "expense", "Allocation", "Asset", "Underlying",
            "Percentage", "Benchmark", "Physically", "January", "February", "March",
            "April", "May", "June", "July", "August", "September", "October",
            "November", "December", "Days", "Months", "Year", "YTD", "inception",
            "Change", "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep",
            "Oct", "Nov", "Dec", "2022", "2023", "2024", "2025", "2026"
        };

        // Längere Namen zuerst, damit "Bitcoin Cash" nicht als "Bitcoin" gezählt wird
        private static readonly (string[] Names, string Ticker)[] COIN_NAME_PATTERNS = new[]
        {
            (new[] { "bitcoin cash" }, "BCH"), (new[] { "near protocol" }, "NEAR"), (new[] { "binance coin" }, "BNB"),
            (new[] { "bitcoin" }, "BTC"), (new[] { "ethereum" }, "ETH"), (new[] { "ripple", "xrp" }, "XRP"),
            (new[] { "solana" }, "SOL"), (new[] { "cardano" }, "ADA"), (new[] { "polkadot" }, "DOT"),
            (new[] { "litecoin" }, "LTC"), (new[] { "avalanche" }, "AVAX"), (new[] { "polygon" }, "MATIC"),
            (new[] { "chainlink" }, "LINK"), (new[] { "uniswap" }, "UNI"), (new[] { "aptos" }, "APT"),
            (new[] { "injective" }, "INJ"), (new[] { "celestia" }, "TIA"), (new[] { "filecoin" }, "FIL"),
            (new[] { "hedera" }, "HBAR"), (new[] { "algorand" }, "ALGO"), (new[] { "stellar" }, "XLM"),
            (new[] { "toncoin" }, "TON"), (new[] { "dogecoin" }, "DOGE"), (new[] { "cosmos", "atom" }, "ATOM"),
            (new[] { "tron", "trx" }, "TRX"), (new[] { "sui" }, "SUI"), (new[] { "gold" }, "GOLD"),
            (new[] { "silver" }, "SILVER")
        };

        private static readonly HashSet<string> KNOWN_CRYPTO_TICKERS = new()
        {
            "BTC", "BITCOIN", "ETH", "ETHEREUM", "XRP", "RIPPLE", "BNB", "SOL", "SOLANA",
            "ADA", "CARDANO", "DOGE", "AVAX", "DOT", "POLKADOT", "MATIC", "LINK", "UNI",
            "LTC", "ATOM", "COSMOS", "NEAR", "APT", "SUI", "INJ", "TIA", "FIL", "ICP",
            "HBAR", "ALGO", "XLM", "TON", "TRX", "BCH"
        };

        private const int WEIGHT_SUM_MIN = 90;
        private const int WEIGHT_SUM_MAX = 110;
        private const int MAX_CONSTITUENTS = 20;
        private static readonly Regex ISIN_REGEX = new(@"^[A-Z]{2}[A-Z0-9]{9}[0-9]$");
        private static readonly Regex WEIGHT_REGEX = new(
            @"([A-Za-z0-9][A-Za-z0-9 \-.()]{1,40})\s+(\d{1,3}(?:[.,]\d{1,4})?)\s*%?",
            RegexOptions.IgnoreCase
        );

        public static string NormalizeIsin(string isin)
        {
            return isin.Trim().ToUpperInvariant().Replace(" ", "");
        }

        public static void ValidateIsinFormat(string isin)
        {
            if (!ISIN_REGEX.IsMatch(isin))
                throw new ArgumentException(
                    "Ungültiges ISIN-Format. Erwartet: 12 Zeichen (2 Buchstaben + 9 alphanumerisch + 1 Prüfziffer)"
                );
        }

        /// <summary>Extrahiert genau einen Coin aus Produktnamen, falls genau einer vorkommt.</summary>
        public static string? ExtractSingleCoinFromName(string productName)
        {
            var nameLower = productName.ToLowerInvariant();
            var foundTickers = new HashSet<string>();

            foreach (var (names, ticker) in COIN_NAME_PATTERNS)
            {
                foreach (var coinName in names)
                {
                    var pattern = $@"\b{Regex.Escape(coinName)}\b";
                    if (Regex.IsMatch(nameLower, pattern, RegexOptions.IgnoreCase))
                    {
                        foundTickers.Add(ticker);
                        nameLower = Regex.Replace(nameLower, pattern, "___", RegexOptions.IgnoreCase);
                        break;
                    }
                }
            }

            return foundTickers.Count == 1 ? foundTickers.First() : null;
        }

        private static bool IsBlacklisted(string name)
        {
            var lower = name.Trim().ToLowerInvariant();
            return BLACKLIST_KEYWORDS.Any(kw => lower.Contains(kw.ToLowerInvariant()));
        }

        private static string NormalizeWeightValue(string val)
        {
            return val.Replace(",", ".");
        }

        private static double ParseWeight(string val)
        {
            return double.TryParse(NormalizeWeightValue(val), System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var w) ? w : 0;
        }

        private static bool LooksLikeTicker(string name)
        {
            var upper = name.ToUpperInvariant().Trim();
            if (Regex.IsMatch(upper, @"^[A-Z]{2,10}$")) return true;
            if (KNOWN_CRYPTO_TICKERS.Contains(upper)) return true;
            return KNOWN_CRYPTO_TICKERS.Any(t => upper.Contains(t));
        }

        /// <summary>Extrahiert Konstituenten aus einem Textblock mittels Gewicht-Regex.</summary>
        public static List<ConstituentWeight> ExtractConstituentsFromBlock(string block, bool requireTicker)
        {
            var matches = new List<ConstituentWeight>();
            foreach (Match m in WEIGHT_REGEX.Matches(block))
            {
                var name = m.Groups[1].Value.Trim();
                var weight = ParseWeight(m.Groups[2].Value);

                if (IsBlacklisted(name)) continue;
                if (weight <= 0 || weight > 100) continue;

                var nameUpper = name.ToUpperInvariant().Trim();
                var looksLike = LooksLikeTicker(name);
                var isCommodity = nameUpper.Contains("GOLD") || nameUpper.Contains("XAU") ||
                    nameUpper.Contains("SILVER") || nameUpper.Contains("XAG");
                if (requireTicker && !looksLike && !isCommodity && name.Length > 12) continue;

                matches.Add(new ConstituentWeight { Name = name, Weight = weight });
            }

            return matches
                .OrderByDescending(x => x.Weight)
                .Take(MAX_CONSTITUENTS)
                .ToList();
        }

        /// <summary>Normalisiert Gewichte auf 100%, wenn Summe im Toleranzbereich.</summary>
        public static List<ConstituentWeight> NormalizeWeightsTo100(List<ConstituentWeight> constituents)
        {
            var sum = constituents.Sum(c => c.Weight);
            if (sum < WEIGHT_SUM_MIN || sum > WEIGHT_SUM_MAX)
                return constituents;

            var factor = 100.0 / sum;
            return constituents.Select(c => new ConstituentWeight
            {
                Name = c.Name,
                Weight = Math.Round(c.Weight * factor * 100) / 100
            }).ToList();
        }

        /// <summary>Findet die relevante Sektion (z.B. ASSET ALLOCATION) im Text.</summary>
        public static string ExtractRelevantSection(string text, string[] sectionHeaders)
        {
            foreach (var header in sectionHeaders)
            {
                var idx = text.IndexOf(header, StringComparison.OrdinalIgnoreCase);
                if (idx >= 0)
                {
                    var start = idx + header.Length;
                    var rest = text.Substring(start, Math.Min(2500, text.Length - start));
                    var nextSection = rest.IndexOf("TRADING", StringComparison.OrdinalIgnoreCase);
                    if (nextSection < 0) nextSection = rest.IndexOf("FUNDAMENTALS", StringComparison.OrdinalIgnoreCase);
                    if (nextSection < 0) nextSection = rest.IndexOf("RISK", StringComparison.OrdinalIgnoreCase);
                    var block = nextSection >= 0 ? rest.Substring(0, nextSection) : rest.Substring(0, Math.Min(1500, rest.Length));
                    return block;
                }
            }
            return text.Substring(0, Math.Min(2000, text.Length));
        }

        private static readonly string[] SECTION_HEADERS_UNKNOWN = {
            "ASSET ALLOCATION", "Asset Allocation", "INDEX COMPOSITION", "Index Composition",
            "PORTFOLIO", "Portfolio", "WEIGHTING", "Constituents", "Holdings", "HOLDINGS"
        };

        /// <summary>Parst Factsheet-Text und liefert asOfDate + constituents.</summary>
        public static (string? AsOfDate, List<ConstituentWeight> Constituents) ParseFactsheetText(
            string text, string provider = "unknown")
        {
            string? asOfDate = null;
            var asOfPatterns = new[]
            {
                @"[Aa]s of\s+(\d{1,2}\s+[A-Za-z]+,?\s*\d{4})",
                @"[Aa]s of\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
                @"[Ss]tand\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
                @"[Dd]atum[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
                @"[Dd]ate[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})"
            };

            foreach (var pat in asOfPatterns)
            {
                var m = Regex.Match(text, pat);
                if (m.Success)
                {
                    asOfDate = m.Groups[1].Value.Trim().Replace("  ", " ");
                    break;
                }
            }

            var section = ExtractRelevantSection(text, SECTION_HEADERS_UNKNOWN);
            var constituents = ExtractConstituentsFromBlock(section, false);
            constituents = NormalizeWeightsTo100(constituents);

            var sum = constituents.Sum(c => c.Weight);
            if (constituents.Count == 0 || sum < WEIGHT_SUM_MIN || sum > WEIGHT_SUM_MAX)
            {
                // Full-Text Single-Coin Fallback
                var singlePatterns = new (Regex, string)[]
                {
                    (new Regex(@"\bbitcoin\b", RegexOptions.IgnoreCase), "BTC"),
                    (new Regex(@"\bethereum\b", RegexOptions.IgnoreCase), "ETH"),
                    (new Regex(@"\bcosmos\b", RegexOptions.IgnoreCase), "ATOM"),
                    (new Regex(@"\bripple\b", RegexOptions.IgnoreCase), "XRP"),
                    (new Regex(@"\bsolana\b", RegexOptions.IgnoreCase), "SOL"),
                    (new Regex(@"\bcardano\b", RegexOptions.IgnoreCase), "ADA"),
                    (new Regex(@"\bpolkadot\b", RegexOptions.IgnoreCase), "DOT"),
                    (new Regex(@"\blitecoin\b", RegexOptions.IgnoreCase), "LTC"),
                    (new Regex(@"\bavalanche\b", RegexOptions.IgnoreCase), "AVAX"),
                    (new Regex(@"\bpolygon\b", RegexOptions.IgnoreCase), "MATIC"),
                    (new Regex(@"\bchainlink\b", RegexOptions.IgnoreCase), "LINK"),
                    (new Regex(@"\bsui\b", RegexOptions.IgnoreCase), "SUI"),
                    (new Regex(@"\btron\b", RegexOptions.IgnoreCase), "TRX")
                };

                var found = new HashSet<string>();
                foreach (var (regex, ticker) in singlePatterns)
                {
                    if (regex.IsMatch(text)) found.Add(ticker);
                }
                if (found.Count == 1)
                    constituents = new List<ConstituentWeight> { new() { Name = found.First(), Weight = 100 } };
            }

            return (asOfDate, constituents);
        }

        /// <summary>Validiert Ergebnis: mindestens 1 Konstituent, Summe 90–110%.</summary>
        public static bool IsValidResult(List<ConstituentWeight> constituents, out string? errorMessage)
        {
            errorMessage = null;
            if (constituents == null || constituents.Count < 1)
            {
                errorMessage = "Keine Konstituenten extrahiert.";
                return false;
            }
            var sum = constituents.Sum(c => c.Weight);
            if (sum < WEIGHT_SUM_MIN || sum > WEIGHT_SUM_MAX)
            {
                errorMessage = $"Gewichtssumme {sum:F2}% außerhalb der Toleranz (90–110%).";
                return false;
            }
            return true;
        }

        /// <summary>Haupt-Workflow (vereinfacht ohne Cache/DB/PDF – Kernlogik).</summary>
        public static object RunWorkflowLogic(string isin, string? productName)
        {
            var normalizedIsin = NormalizeIsin(isin);

            try { ValidateIsinFormat(normalizedIsin); }
            catch (ArgumentException ex)
            {
                return new WorkflowError { Code = "INVALID_ISIN", Message = ex.Message };
            }

            // Quick-Path: Excel-Produktname mit genau einem Coin
            if (!string.IsNullOrWhiteSpace(productName))
            {
                var singleCoin = ExtractSingleCoinFromName(productName);
                if (singleCoin != null)
                {
                    var constituents = new List<ConstituentWeight> { new() { Name = singleCoin, Weight = 100 } };
                    return new WeightsResult
                    {
                        Isin = normalizedIsin,
                        AsOfDate = null,
                        Constituents = constituents,
                        NavUsd = null,
                        SourcePdfUrl = $"excel:{normalizedIsin}",
                        CacheStatus = "MISS",
                        FetchedAt = DateTime.UtcNow.ToString("o")
                    };
                }
            }

            // An dieser Stelle würde die URL-Resolution, PDF-Download, Parsing usw. folgen.
            // Vereinfachte Rückgabe: Fehler „URL_NOT_FOUND“ (ohne externe Abhängigkeiten).
            return new WorkflowError
            {
                Code = "URL_NOT_FOUND",
                Message = "Factsheet-URL nicht gefunden (C#-Referenz: Keine externe URL-Resolution/PDF-Logik implementiert)."
            };
        }
    }
}
```

### Hinweise zur C#-Implementierung

1. **Vollständigkeit**: Die obige C#-Variante enthält die **Kernlogik** (ISIN-Validierung, Coin-Erkennung, Parser, Validierung). URL-Resolution, PDF-Download, Cache und OCR sind bewusst weggelassen, da diese stark von .NET-Bibliotheken (z.B. `PdfPig`, `Tesseract`, `HttpClient`, Supabase-/REST-Clients) abhängen.

2. **COIN_NAME_PATTERNS**: Im Original ist die Reihenfolge wichtig (lange Namen zuerst). In C# müsste die Iteration über ein geordnetes Dictionary oder eine Liste erfolgen.

3. **ExtractSingleCoinFromName**: Die vereinfachte Version nutzt ein einfaches `Dictionary`; die vollständige Logik müsste die gleiche Reihenfolge wie in `workflow.ts` (COIN_NAME_PATTERNS) einhalten.

4. **Provider-spezifischer Parser**: Die `ParseFactsheetText`-Methode ist auf ein generisches Schema reduziert. VanEck, Bitwise, DDA, CoinShares hätten jeweils eigene `extract*Constituents`-Methoden.

5. **Externe Dienste**: Für eine produktive C#-Variante wären u.a. nötig:
   - `HttpClient` für Factsheet- und API-Aufrufe
   - PDF-Bibliothek (z.B. `PdfPig`, `itext7`) oder Systemabhängige Bindings
   - OCR (z.B. `Tesseract` für .NET)
   - Supabase/REST-Clients für Cache und FetchLog

---

## 7. Dateien-Referenz (TypeScript/Next.js)

| Datei | Rolle |
|-------|-------|
| `src/lib/workflow.ts` | Haupt-Workflow `runWorkflow` |
| `src/lib/parser.ts` | Factsheet-Parsing, provider-spezifisch |
| `src/lib/holdings-api.ts` | 21Shares Xano-API (Konstituenten, NAV) |
| `src/lib/pdf-extract.ts` | PDF-Download, pdf-parse, pdfjs-dist |
| `src/lib/pdf-ocr.ts` | Tesseract-OCR auf Allocation-Seite |
| `src/lib/allowlist.ts` | SSRF-Schutz, URL-Whitelist |
| `src/lib/constants.ts` | TTL, Timeout, Retries |
| `src/data/isin-mapping.json` | ISIN → Provider, URLs |

---

## 8. Fehlercodes

| Code | Bedeutung |
|------|-----------|
| INVALID_ISIN | Ungültiges ISIN-Format |
| URL_NOT_FOUND | Keine Factsheet-URL gefunden |
| FETCH_FAILED | PDF-Download fehlgeschlagen |
| PARSE_FAILED | PDF-Text-Extraktion fehlgeschlagen |
| INSUFFICIENT_DATA | Keine Konstituenten extrahiert |
| WEIGHT_SUM_INVALID | Summe außerhalb 90–110% |
