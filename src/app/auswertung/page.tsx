"use client";

import { useState, useCallback, useEffect } from "react";
interface Constituent {
  name: string;
  weight: number;
}

interface WeightResult {
  id: string;
  isin: string;
  name: string;
  constituents: Constituent[];
  created_at: string;
}

type TradeSide = "B" | "S";

interface CsvRow {
  isincod: string;
  betrag: number;
  side: TradeSide;
}

interface MatchedRow {
  isincod: string;
  betrag: number;
  side: TradeSide;
  dbEntry: WeightResult;
}

interface CryptoAllocation {
  name: string;
  totalAmount: number;
  buyAmount: number;
  sellAmount: number;
  contributions: {
    isin: string;
    productName: string;
    betrag: number;
    weight: number;
    amount: number;
    side: TradeSide;
  }[];
}

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseBetrag(raw: string): number | null {
  const cleaned = raw.trim().replace(/['"]/g, "");
  if (!cleaned) return null;
  // German format: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  // Standard with comma decimal: 1234,56 → 1234.56
  if (/^\d+(,\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(",", "."));
  }
  // Standard with dot decimal: 1234.56
  const num = parseFloat(cleaned.replace(/\s/g, ""));
  return isNaN(num) ? null : num;
}

function parseCsvFile(file: File): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error("Datei konnte nicht gelesen werden"));
          return;
        }
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          resolve([]);
          return;
        }

        const delimiter = detectDelimiter(lines[0]);
        const splitLine = (line: string) =>
          line.split(delimiter).map((cell) =>
            cell.trim().replace(/^["']|["']$/g, "")
          );

        const headers = splitLine(lines[0]).map((h) =>
          h.toLowerCase().trim()
        );

        const colIsin = headers.findIndex((h) =>
          h === "isincod" || h === "isin_cod" || h === "isin cod" ||
          h === "isin" || h === "isin code" || h === "isincode"
        );
        const colBetrag = headers.findIndex((h) =>
          h === "betrag" || h === "amount" || h === "wert" ||
          h === "marktwert" || h === "value"
        );
        const colSide = headers.findIndex((h) =>
          h === "ordrbuycod" || h === "ordr_buy_cod" || h === "ordrbuy" ||
          h === "side" || h === "buy/sell" || h === "buysell"
        );

        if (colIsin < 0) {
          reject(new Error("Keine Spalte 'ISINCOD' gefunden. Bitte prüfe die CSV-Spaltenbezeichnungen."));
          return;
        }
        if (colBetrag < 0) {
          reject(new Error("Keine Spalte 'BETRAG' gefunden. Bitte prüfe die CSV-Spaltenbezeichnungen."));
          return;
        }

        const out: CsvRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cells = splitLine(lines[i]);
          const isinRaw = (cells[colIsin] ?? "").trim().toUpperCase().replace(/\s/g, "");
          const betragRaw = cells[colBetrag] ?? "";
          const sideRaw = colSide >= 0 ? (cells[colSide] ?? "").trim().toUpperCase() : "B";
          if (!isinRaw) continue;
          if (!ISIN_REGEX.test(isinRaw)) continue;
          const betrag = parseBetrag(betragRaw);
          if (betrag === null || betrag === 0) continue;
          const side: TradeSide = sideRaw === "S" ? "S" : "B";
          out.push({ isincod: isinRaw, betrag, side });
        }
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsText(file, "UTF-8");
  });
}

const COIN_ALIASES: Record<string, string> = {
  // Bitcoin
  bitcoin: "BTC",
  // Ethereum
  ethereum: "ETH",
  // Solana
  solana: "SOL",
  // XRP
  xrp: "XRP",
  ripple: "XRP",
  // Cardano
  cardano: "ADA",
  // Polkadot
  polkadot: "DOT",
  // Avalanche
  avalanche: "AVAX",
  // Chainlink
  chainlink: "LINK",
  // Polygon
  polygon: "MATIC",
  matic: "MATIC",
  // Uniswap
  uniswap: "UNI",
  // Litecoin
  litecoin: "LTC",
  // Dogecoin
  dogecoin: "DOGE",
  // Cosmos
  cosmos: "ATOM",
  // BNB
  bnb: "BNB",
  binancecoin: "BNB",
  // Filecoin
  filecoin: "FIL",
  // Stellar
  stellar: "XLM",
  // Algorand
  algorand: "ALGO",
  // VeChain
  vechain: "VET",
  // Hedera
  hedera: "HBAR",
  hbar: "HBAR",
  // Near
  near: "NEAR",
  // Aptos
  aptos: "APT",
  // Sui
  sui: "SUI",
  // Internet Computer
  "internet computer": "ICP",
  icp: "ICP",
  // Arbitrum
  arbitrum: "ARB",
  // Optimism
  optimism: "OP",
  // Celestia
  celestia: "TIA",
  tia: "TIA",
  // Injective
  injective: "INJ",
  // Stacks
  stacks: "STX",
  // TON
  ton: "TON",
  toncoin: "TON",
};

function normalizeCoinName(name: string): string {
  const lower = name.toLowerCase().trim();
  return COIN_ALIASES[lower] ?? name;
}

function buildAllocations(matched: MatchedRow[]): CryptoAllocation[] {
  const map = new Map<string, CryptoAllocation>();

  for (const row of matched) {
    for (const c of row.dbEntry.constituents) {
      const canonicalName = normalizeCoinName(c.name);
      const amount = (row.betrag * c.weight) / 100;
      if (!map.has(canonicalName)) {
        map.set(canonicalName, { name: canonicalName, totalAmount: 0, buyAmount: 0, sellAmount: 0, contributions: [] });
      }
      const alloc = map.get(canonicalName)!;
      if (row.side === "B") {
        alloc.buyAmount += amount;
      } else {
        alloc.sellAmount += amount;
      }
      alloc.totalAmount = alloc.buyAmount - alloc.sellAmount;
      alloc.contributions.push({
        isin: row.isincod,
        productName: row.dbEntry.name,
        betrag: row.betrag,
        weight: c.weight,
        amount,
        side: row.side,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));
}

export default function AuswertungPage() {
  const [dbEntries, setDbEntries] = useState<WeightResult[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<CryptoAllocation[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    fetch("/api/weight-results")
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          setDbError(result.error);
          return;
        }
        setDbEntries(Array.isArray(result) ? result : []);
      })
      .catch(() => setDbError("Fehler beim Laden der Datenbank"))
      .finally(() => setDbLoading(false));
  }, []);

  const processCsvRows = useCallback(
    (rows: CsvRow[]) => {
      const matchedRows: MatchedRow[] = [];
      const missing: string[] = [];

      for (const row of rows) {
        const dbEntry = dbEntries.find(
          (d) => d.isin.toUpperCase() === row.isincod
        );
        if (dbEntry) {
          matchedRows.push({ ...row, dbEntry });
        } else {
          missing.push(row.isincod);
        }
      }

      const built = buildAllocations(matchedRows);
      setMatched(matchedRows);
      setNotFound(missing);
      setAllocations(built);

      // Preise abrufen für alle gefundenen Coins (XAU ausschließen)
      const EXCLUDE_FROM_PRICE_API = new Set(["XAU"]);
      if (built.length > 0) {
        const symbols = built
          .map((a) => a.name)
          .filter((s) => !EXCLUDE_FROM_PRICE_API.has(s.toUpperCase()))
          .join(",");
        setPricesLoading(true);
        fetch(`/api/coinprices?symbols=${encodeURIComponent(symbols)}`)
          .then((r) => r.json())
          .then((data) => {
            if (!data.error) setPrices(data);
          })
          .catch(() => {})
          .finally(() => setPricesLoading(false));
      }
    },
    [dbEntries]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.csv$/i) && !file.type.includes("csv") && !file.type.includes("text")) {
        setParseError("Bitte eine CSV-Datei hochladen.");
        return;
      }
      setParseError(null);
      setCsvRows([]);
      setMatched([]);
      setNotFound([]);
      setAllocations([]);
      try {
        const rows = await parseCsvFile(file);
        if (rows.length === 0) {
          setParseError("Keine gültigen Zeilen mit ISINCOD und BETRAG gefunden.");
          return;
        }
        setCsvRows(rows);
        processCsvRows(rows);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "CSV konnte nicht gelesen werden.");
      }
    },
    [processCsvRows]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const totalBetrag = matched.reduce((s, r) => s + r.betrag, 0);
  const totalAllocated = allocations.reduce((s, a) => s + a.totalAmount, 0);

  const formatAmount = (n: number) =>
    n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl tracking-tight text-neutral-100 mb-1">
            Portfolio-Auswertung
          </h1>
          <p className="text-neutral-400 text-sm">
            CSV hochladen → Beträge mit Crypto-Gewichtungen multiplizieren
          </p>
        </div>

        {dbError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {dbError}
          </div>
        )}

        {/* Aggregierte Coin-Übersicht */}
        {allocations.length > 0 && (
          <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center">
              <span className="text-sm text-neutral-400">Crypto-Allokation</span>
              <span className="text-sm text-neutral-500 flex items-center gap-2">
                {pricesLoading && (
                  <span className="text-xs text-neutral-600">Kurse laden…</span>
                )}
                Total:{" "}
                <span className="text-neutral-200 tabular-nums">{formatAmount(totalAllocated)}</span>
              </span>
            </div>
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="h-5 rounded-lg overflow-hidden flex">
                {allocations.map((a, i) => {
                  const pct = totalAllocated > 0 ? (a.totalAmount / totalAllocated) * 100 : 0;
                  const colors = ["#f59e0b","#22d3ee","#a78bfa","#34d399","#f472b6","#fb923c","#60a5fa","#4ade80"];
                  return (
                    <div
                      key={a.name}
                      style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length], minWidth: pct > 0.3 ? "2px" : "0" }}
                      title={`${a.name}: ${formatAmount(a.totalAmount)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
            </div>
            {/* Tabellen-Header */}
            <div className="grid grid-cols-[auto_1fr_repeat(6,auto)] items-center gap-x-4 px-5 py-2 border-b border-neutral-800 text-xs text-neutral-500">
              <span className="w-2.5" />
              <span>Coin</span>
              <span className="text-right w-28">Kurs (USD)</span>
              <span className="text-right w-28">Buy</span>
              <span className="text-right w-28">Sell</span>
              <span className="text-right w-32">Gesamt</span>
              <span className="text-right w-28">Anzahl</span>
              <span className="text-right w-14">Anteil</span>
            </div>
            <div className="divide-y divide-neutral-800">
              {allocations.map((alloc, idx) => {
                const pct = totalAllocated > 0 ? (alloc.totalAmount / totalAllocated) * 100 : 0;
                const colors = ["#f59e0b","#22d3ee","#a78bfa","#34d399","#f472b6","#fb923c","#60a5fa","#4ade80"];
                const priceUsd = prices[alloc.name.toUpperCase()] ?? null;
                const coinCount = priceUsd && priceUsd > 0 ? Math.abs(alloc.totalAmount) / priceUsd : null;
                return (
                  <div key={alloc.name} className="grid grid-cols-[auto_1fr_repeat(6,auto)] items-center gap-x-4 px-5 py-2.5 hover:bg-neutral-800/20">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                    <span className="text-sm text-neutral-200">{alloc.name}</span>
                    <span className="tabular-nums text-sm text-neutral-400 text-right w-28">
                      {priceUsd != null
                        ? `$${priceUsd >= 1
                            ? priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : priceUsd.toFixed(4)}`
                        : pricesLoading ? "…" : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-emerald-400 text-right w-28">
                      {alloc.buyAmount > 0 ? formatAmount(alloc.buyAmount) : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-red-400 text-right w-28">
                      {alloc.sellAmount > 0 ? formatAmount(alloc.sellAmount) : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-amber-400 text-right w-32">{formatAmount(alloc.totalAmount)}</span>
                    <span className="tabular-nums text-sm text-emerald-400 text-right w-28">
                      {coinCount != null
                        ? coinCount >= 0.01
                          ? coinCount.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
                          : coinCount.toFixed(8)
                        : pricesLoading ? "…" : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-neutral-500 text-right w-14">{pct.toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Drag & Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          className={`mb-8 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragOver
              ? "border-amber-500 bg-amber-500/5"
              : "border-neutral-700 hover:border-neutral-600"
          }`}
        >
          <div className="mb-3 text-3xl text-neutral-600">↓</div>
          <p className="text-neutral-300 text-sm mb-1">
            CSV-Datei hierher ziehen oder per Klick öffnen
          </p>
          <p className="text-neutral-500 text-xs mb-5">
            Benötigte Spalten: <span className="font-mono text-neutral-400">ISINCOD</span>,{" "}
            <span className="font-mono text-neutral-400">BETRAG</span> und{" "}
            <span className="font-mono text-neutral-400">ORDRBUYCOD</span> (B/S)
          </p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            id="csv-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="csv-input"
            className="inline-block rounded-xl bg-neutral-800 px-5 py-2.5 text-sm text-neutral-200 cursor-pointer hover:bg-neutral-700 transition-colors"
          >
            Datei auswählen
          </label>
          {csvRows.length > 0 && (
            <p className="mt-4 text-amber-400 text-sm">
              {csvRows.length} gültige Zeile(n) geladen · {matched.length} in Datenbank gefunden
            </p>
          )}
        </div>

        {parseError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {parseError}
          </div>
        )}

        {dbLoading && !csvRows.length && (
          <p className="text-neutral-500 text-sm text-center">Lade Datenbank…</p>
        )}


        {matched.length > 0 && (
          <>
            {/* Matched ISINs Tabelle */}
            <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center">
                <span className="text-sm text-neutral-400">
                  Gefundene Trades ({matched.length})
                </span>
                <span className="text-sm text-neutral-500">
                  Gesamt: <span className="text-neutral-200 tabular-nums">{formatAmount(totalBetrag)}</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-800 bg-neutral-900">
                      <th className="px-5 py-3 font-normal">ISIN</th>
                      <th className="px-5 py-3 font-normal">Produkt</th>
                      <th className="px-5 py-3 font-normal text-center w-16">B/S</th>
                      <th className="px-5 py-3 font-normal text-right">Betrag</th>
                      <th className="px-5 py-3 font-normal text-right" colSpan={2}>Konstituenten</th>
                    </tr>
                  </thead>
                  {matched.map((row, idx) => (
                      <tbody key={`${row.isincod}-${idx}`}>
                        <tr className="border-b border-neutral-800/50">
                          <td className="px-5 py-3 font-mono text-neutral-200">
                            {row.isincod}
                          </td>
                          <td className="px-5 py-3 text-neutral-300 truncate max-w-[200px]">
                            {row.dbEntry.name}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              row.side === "B"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-red-500/15 text-red-400"
                            }`}>
                              {row.side === "B" ? "Buy" : "Sell"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-neutral-200">
                            {formatAmount(row.betrag)}
                          </td>
                          <td className="px-5 py-3 text-right text-neutral-500" colSpan={2}>
                            {row.dbEntry.constituents.length} Konst.
                          </td>
                        </tr>
                        <tr className="border-b border-neutral-800">
                          <td colSpan={6} className="px-5 py-4 bg-neutral-900/80">
                            <div className="text-xs text-neutral-500 mb-3">
                              Aufschlüsselung — {row.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} × Gewicht
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {[...row.dbEntry.constituents]
                                .sort((a, b) => b.weight - a.weight)
                                .map((c, i) => (
                                  <div
                                    key={i}
                                    className="flex justify-between items-center rounded-lg bg-neutral-800/60 px-3 py-2"
                                  >
                                    <span className="text-neutral-300 text-xs">{c.name}</span>
                                    <div className="text-right">
                                      <div className="text-xs text-amber-400 tabular-nums">
                                        {formatAmount((row.betrag * c.weight) / 100)}
                                      </div>
                                      <div className="text-xs text-neutral-500 tabular-nums">
                                        {c.weight.toFixed(2)}%
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    ))}
              </table>
              </div>
            </div>

          </>
        )}

        {!csvRows.length && !parseError && !dbLoading && (
          <p className="text-neutral-500 text-sm text-center mt-4">
            CSV-Datei mit den Spalten{" "}
            <span className="font-mono text-neutral-400">ISINCOD</span> und{" "}
            <span className="font-mono text-neutral-400">BETRAG</span> hochladen,
            um die Crypto-Allokation zu berechnen.
          </p>
        )}
      </div>
    </div>
  );
}
