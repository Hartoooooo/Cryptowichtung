"use client";

import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import MusteranalyseSection from "@/components/musteranalyse/MusteranalyseSection";
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
  instmnem: string;
  instshtnam: string;
  iban: string;
  trandattim?: string;
}

interface MatchedRow {
  isincod: string;
  betrag: number;
  side: TradeSide;
  instmnem: string;
  instshtnam: string;
  iban: string;
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

/** Extrahiert nur die Uhrzeit aus TRANDATTIM (z.B. "14:30" oder "14:30:00"). */
function extractTimeFromTrandattim(raw: string | undefined): string {
  if (!raw || !raw.trim()) return "—";
  const s = raw.trim();
  // Bereits Zeitformat HH:mm oder HH:mm:ss
  const timeOnly = s.match(/^\d{1,2}:\d{2}(:\d{2})?/);
  if (timeOnly) return timeOnly[0];
  // Zeit irgendwo im String (z.B. "2024-01-15 14:30:00" oder "15.01.2024 14:30")
  const inStr = s.match(/\d{1,2}:\d{2}(:\d{2})?/);
  if (inStr) return inStr[0];
  // Kompakte Form ohne Trennzeichen: 143000 oder 1430
  const compact = s.match(/(\d{2})(\d{2})(\d{2})?$/);
  if (compact) return compact[3] ? `${compact[1]}:${compact[2]}:${compact[3]}` : `${compact[1]}:${compact[2]}`;
  return "—";
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
        const colInstmnem = headers.findIndex((h) =>
          h === "instmnem" || h === "inst_mnem" || h === "instrument" ||
          h === "ticker" || h === "symbol"
        );
        const colInstshtnam = headers.findIndex((h) =>
          h === "instshtnam" || h === "inst_sht_nam" || h === "instrumentshortname" ||
          h === "instrument short name" || h === "shortname" || h === "short name"
        );
        const colIban = headers.findIndex((h) => {
          const x = h.replace(/[^a-z0-9]/g, "");
          return ["iban", "ordraccount", "orderaccount", "ordraccnum", "order_account",
            "konto", "account", "kontonummer", "depot", "accnum", "acct"].includes(x);
        });
        const colTrandattim = headers.findIndex((h) => {
          const x = h.toLowerCase().replace(/[^a-z0-9]/g, "");
          return x === "trandattim" || h.toLowerCase().includes("trandattim") ||
            x === "datum" || x === "date" || x === "zeit" || x === "time" ||
            x === "timestamp" || x === "datetime" || x === "transaktionsdatum" ||
            x === "orderdate" || x === "tradedate" || x === "executiontime";
        });

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
          const instmnem = colInstmnem >= 0 ? (cells[colInstmnem] ?? "").trim() : "";
          const instshtnam = colInstshtnam >= 0 ? (cells[colInstshtnam] ?? "").trim() : "";
          const iban = colIban >= 0 ? (cells[colIban] ?? "").trim() : "";
          if (!isinRaw) continue;
          if (!ISIN_REGEX.test(isinRaw)) continue;
          const betrag = parseBetrag(betragRaw);
          if (betrag === null || betrag === 0) continue;
          const side: TradeSide = sideRaw === "S" ? "S" : "B";
          const trandattim = colTrandattim >= 0 ? (cells[colTrandattim] ?? "").trim() : undefined;
          out.push({ isincod: isinRaw, betrag, side, instmnem, instshtnam, iban, trandattim: trandattim || undefined });
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
  pol: "MATIC",
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
  // Rohstoffe/Edelmetalle
  gold: "XAU",
  xau: "XAU",
  silver: "XAG",
  xag: "XAG",
};

function normalizeCoinName(name: string): string {
  const lower = name.toLowerCase().trim();
  return COIN_ALIASES[lower] ?? name;
}

/** Rohstoffe (Edelmetalle) – eigene Sektion */
const ROHSTOFF_SYMBOLS = new Set(["XAU", "XAG", "GOLD", "SILVER"]);

function isRohstoff(name: string): boolean {
  return ROHSTOFF_SYMBOLS.has(name.toUpperCase().trim());
}

/** Anzeigename für Rohstoffe */
const ROHSTOFF_DISPLAY: Record<string, string> = {
  XAU: "Gold",
  XAG: "Silber",
  GOLD: "Gold",
  SILVER: "Silber",
};

function getRohstoffDisplayName(name: string): string {
  const upper = name.toUpperCase().trim();
  return ROHSTOFF_DISPLAY[upper] ?? name;
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
  const [ibanFilter, setIbanFilter] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [coinsExpanded, setCoinsExpanded] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [positionSortBy, setPositionSortBy] = useState<"betrag" | "side" | "kürzel" | "uhrzeit">("betrag");
  const [positionSortDir, setPositionSortDir] = useState<"asc" | "desc">("desc");

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

  const aggregatedByIban = useMemo(() => {
    const rows = csvRows.filter((row) => {
      if (ibanFilter.trim()) {
        const q = ibanFilter.toLowerCase();
        const groupKey = row.iban || row.isincod;
        const matchIbanOrIsin = groupKey.toLowerCase().includes(q);
        const matchTicker = (row.instmnem ?? "").toLowerCase().includes(q);
        if (!matchIbanOrIsin && !matchTicker) return false;
      }
      return true;
    });
    const map = new Map<string, { iban: string; tickers: Set<string>; names: Set<string>; buyAmount: number; sellAmount: number; etpLabels: Set<string>; count: number }>();
    for (const row of rows) {
      const key = (row.iban ?? "").trim() || row.isincod;
      if (!map.has(key)) {
        map.set(key, { iban: key, tickers: new Set(), names: new Set(), buyAmount: 0, sellAmount: 0, etpLabels: new Set(), count: 0 });
      }
      const agg = map.get(key)!;
      agg.count += 1;
      if (row.instmnem) agg.tickers.add(row.instmnem);
      const dbEntry = dbEntries.find((d) => d.isin.toUpperCase() === row.isincod);
      const nameVal = (row.instshtnam ?? "").trim() || dbEntry?.name;
      if (nameVal) agg.names.add(nameVal);
      if (row.side === "B") agg.buyAmount += row.betrag;
      else agg.sellAmount += row.betrag;
      if (dbEntry) {
        const canonical = dbEntry.constituents.length === 1
          ? normalizeCoinName(dbEntry.constituents[0].name)
          : "Basket";
        const label = canonical === "Basket" ? "Basket" : (isRohstoff(canonical) ? getRohstoffDisplayName(canonical) : canonical);
        agg.etpLabels.add(label);
      }
    }
    return Array.from(map.values())
      .map((a) => {
        const labels = Array.from(a.etpLabels);
        const etpLabel = labels.length === 0 ? "" : labels.length === 1 ? labels[0] : "Basket";
        const tickerDisplay = Array.from(a.tickers).filter(Boolean).join(", ") || "—";
        const nameDisplay = Array.from(a.names).filter(Boolean).join(", ") || "—";
        return { ...a, gesamt: a.buyAmount - a.sellAmount, etpLabel, tickerDisplay, nameDisplay };
      })
      .sort((a, b) => Math.abs(b.gesamt) - Math.abs(a.gesamt));
  }, [csvRows, ibanFilter, dbEntries]);

  const selectedPositionTrades = useMemo(() => {
    if (!selectedPosition) return [];
    return csvRows
      .filter((row) => ((row.iban ?? "").trim() || row.isincod) === selectedPosition)
      .sort((a, b) => {
        const mul = positionSortDir === "asc" ? 1 : -1;
        if (positionSortBy === "betrag") return mul * (Math.abs(b.betrag) - Math.abs(a.betrag));
        if (positionSortBy === "side") return mul * (a.side.localeCompare(b.side));
        if (positionSortBy === "uhrzeit") {
          const toSec = (raw: string | undefined) => {
            const t = extractTimeFromTrandattim(raw);
            if (t === "—") return 999999;
            const [h, m, s] = t.split(":").map(Number);
            return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
          };
          return mul * (toSec(a.trandattim) - toSec(b.trandattim));
        }
        return mul * ((a.instmnem ?? "").localeCompare(b.instmnem ?? ""));
      });
  }, [selectedPosition, csvRows, positionSortBy, positionSortDir]);

  const handleSaveSnapshot = useCallback(async () => {
    if (allocations.length === 0) return;
    setSaveLoading(true);
    setSaveStatus("idle");
    const totalAbs = allocations.reduce((s, a) => s + Math.abs(a.totalAmount), 0);
    const coins = allocations.map((a) => ({
      name: a.name,
      buyAmount: a.buyAmount,
      sellAmount: a.sellAmount,
      totalAmount: a.totalAmount,
      pct: totalAbs > 0 ? (Math.abs(a.totalAmount) / totalAbs) * 100 : 0,
    }));
    const positions = aggregatedByIban.map((agg) => {
      const positionRows = csvRows
        .filter((row) => ((row.iban ?? "").trim() || row.isincod) === agg.iban)
        .sort((a, b) => Math.abs(b.betrag) - Math.abs(a.betrag));
      const trades = positionRows.map((row) => {
        const dbEntry = dbEntries.find((d) => d.isin.toUpperCase() === row.isincod);
        const etpLabel = dbEntry
          ? dbEntry.constituents.length === 1
            ? (() => {
                const c = normalizeCoinName(dbEntry.constituents[0].name);
                return isRohstoff(c) ? getRohstoffDisplayName(c) : c;
              })()
            : "Basket"
          : "";
        return {
          side: row.side,
          trandattim: row.trandattim,
          instmnem: row.instmnem ?? "",
          instshtnam: row.instshtnam ?? "",
          betrag: row.betrag,
          etpLabel,
        };
      });
      return {
        iban: agg.iban,
        tickerDisplay: agg.tickerDisplay,
        nameDisplay: agg.nameDisplay,
        count: agg.count,
        buyAmount: agg.buyAmount,
        sellAmount: agg.sellAmount,
        gesamt: agg.gesamt,
        etpLabel: agg.etpLabel,
        trades,
      };
    });
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_date: new Date().toISOString().slice(0, 10),
          coins,
          positions,
        }),
      });
      setSaveStatus(res.ok ? "ok" : "error");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [allocations, aggregatedByIban, csvRows, dbEntries]);

  const totalAllocated = allocations.reduce((s, a) => s + Math.abs(a.totalAmount), 0);

  const cryptoAllocations = useMemo(
    () => allocations.filter((a) => !isRohstoff(a.name)),
    [allocations]
  );
  const rohstoffAllocations = useMemo(
    () => allocations.filter((a) => isRohstoff(a.name)),
    [allocations]
  );
  const totalCryptoAllocated = cryptoAllocations.reduce((s, a) => s + Math.abs(a.totalAmount), 0);
  const totalRohstoffAllocated = rohstoffAllocations.reduce((s, a) => s + Math.abs(a.totalAmount), 0);

  const formatAmount = (n: number) =>
    n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
            <span className="font-mono text-neutral-400">BETRAG</span>,{" "}
            <span className="font-mono text-neutral-400">ORDRBUYCOD</span> (B/S).
            Optional: <span className="font-mono text-neutral-400">INSTSHTNAM</span>,{" "}
            <span className="font-mono text-neutral-400">IBAN</span>
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

        {/* Crypto-Allokation */}
        {cryptoAllocations.length > 0 && (
          <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-400">Crypto-Allokation</span>
                <button
                  onClick={handleSaveSnapshot}
                  disabled={saveLoading}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-neutral-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
                >
                  {saveLoading ? "Speichern…" : "Als Verlauf speichern"}
                </button>
                {saveStatus === "ok" && <span className="text-xs text-emerald-400">Gespeichert</span>}
                {saveStatus === "error" && <span className="text-xs text-red-400">Fehler beim Speichern</span>}
              </div>
              <span className="text-sm text-neutral-500 flex items-center gap-4">
                {pricesLoading && (
                  <span className="text-xs text-neutral-600">Kurse laden…</span>
                )}
                <span>Buy: <span className="text-emerald-400 tabular-nums">{formatAmount(cryptoAllocations.reduce((s, a) => s + a.buyAmount, 0))}</span></span>
                <span>Sell: <span className="text-red-400 tabular-nums">{formatAmount(cryptoAllocations.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
                <span>Netto: <span className="text-amber-400 tabular-nums">{formatAmount(cryptoAllocations.reduce((s, a) => s + a.buyAmount, 0) - cryptoAllocations.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
                <span>Total: <span className="text-neutral-200 tabular-nums">{formatAmount(cryptoAllocations.reduce((s, a) => s + a.buyAmount, 0) + cryptoAllocations.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
              </span>
            </div>

            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="h-5 rounded-lg overflow-hidden flex">
                {cryptoAllocations.map((a, i) => {
                  const pct = totalCryptoAllocated > 0 ? (Math.abs(a.totalAmount) / totalCryptoAllocated) * 100 : 0;
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
              {cryptoAllocations.slice(0, 10).map((alloc, idx) => {
                const pct = totalCryptoAllocated > 0 ? (Math.abs(alloc.totalAmount) / totalCryptoAllocated) * 100 : 0;
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
                    <span className={`tabular-nums text-sm text-right w-28 ${alloc.totalAmount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {coinCount != null
                        ? (Math.ceil(coinCount * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : pricesLoading ? "…" : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-neutral-500 text-right w-14">{pct.toFixed(2)}%</span>
                  </div>
                );
              })}
              {cryptoAllocations.length > 10 && (
                <>
                  <button
                    onClick={() => setCoinsExpanded(!coinsExpanded)}
                    className="w-full flex justify-end px-5 py-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    {coinsExpanded ? "Weniger ▲" : `+${cryptoAllocations.length - 10} weitere ▼`}
                  </button>
                  {coinsExpanded && cryptoAllocations.slice(10).map((alloc, idx) => {
                    const pct = totalCryptoAllocated > 0 ? (Math.abs(alloc.totalAmount) / totalCryptoAllocated) * 100 : 0;
                    const colors = ["#f59e0b","#22d3ee","#a78bfa","#34d399","#f472b6","#fb923c","#60a5fa","#4ade80"];
                    const priceUsd = prices[alloc.name.toUpperCase()] ?? null;
                    const coinCount = priceUsd && priceUsd > 0 ? Math.abs(alloc.totalAmount) / priceUsd : null;
                    return (
                      <div key={alloc.name} className="grid grid-cols-[auto_1fr_repeat(6,auto)] items-center gap-x-4 px-5 py-2.5 hover:bg-neutral-800/20">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[(idx + 10) % colors.length] }} />
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
                        <span className={`tabular-nums text-sm text-right w-28 ${alloc.totalAmount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {coinCount != null
                            ? (Math.ceil(coinCount * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : pricesLoading ? "…" : "—"}
                        </span>
                        <span className="tabular-nums text-sm text-neutral-500 text-right w-14">{pct.toFixed(2)}%</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* Rohstoff-Allokation (Gold, Silber, etc.) */}
        {rohstoffAllocations.length > 0 && (
          <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-400">Rohstoff-Allokation</span>
                {cryptoAllocations.length === 0 && (
                  <>
                    <button
                      onClick={handleSaveSnapshot}
                      disabled={saveLoading}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-neutral-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
                    >
                      {saveLoading ? "Speichern…" : "Als Verlauf speichern"}
                    </button>
                    {saveStatus === "ok" && <span className="text-xs text-emerald-400">Gespeichert</span>}
                    {saveStatus === "error" && <span className="text-xs text-red-400">Fehler beim Speichern</span>}
                  </>
                )}
              </div>
              <span className="text-sm text-neutral-500 flex items-center gap-4">
                <span>Buy: <span className="text-emerald-400 tabular-nums">{formatAmount(rohstoffAllocations.reduce((s, a) => s + a.buyAmount, 0))}</span></span>
                <span>Sell: <span className="text-red-400 tabular-nums">{formatAmount(rohstoffAllocations.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
                <span>Netto: <span className="text-amber-400 tabular-nums">{formatAmount(rohstoffAllocations.reduce((s, a) => s + a.buyAmount, 0) - rohstoffAllocations.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
                <span>Total: <span className="text-neutral-200 tabular-nums">{formatAmount(rohstoffAllocations.reduce((s, a) => s + a.buyAmount, 0) + rohstoffAllocations.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
              </span>
            </div>
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="h-5 rounded-lg overflow-hidden flex">
                {rohstoffAllocations.map((a, i) => {
                  const pct = totalRohstoffAllocated > 0 ? (Math.abs(a.totalAmount) / totalRohstoffAllocated) * 100 : 0;
                  const colors = ["#d4af37","#c0c0c0","#cd7f32","#b87333"];
                  return (
                    <div
                      key={a.name}
                      style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length], minWidth: pct > 0.3 ? "2px" : "0" }}
                      title={`${getRohstoffDisplayName(a.name)}: ${formatAmount(a.totalAmount)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 px-5 py-2 border-b border-neutral-800 text-xs text-neutral-500">
              <span className="w-2.5" />
              <span>Rohstoff</span>
              <span className="text-right w-28">Buy</span>
              <span className="text-right w-28">Sell</span>
              <span className="text-right w-32">Gesamt</span>
              <span className="text-right w-14">Anteil</span>
            </div>
            <div className="divide-y divide-neutral-800">
              {rohstoffAllocations.map((alloc, idx) => {
                const pct = totalRohstoffAllocated > 0 ? (Math.abs(alloc.totalAmount) / totalRohstoffAllocated) * 100 : 0;
                const colors = ["#d4af37","#c0c0c0","#cd7f32","#b87333"];
                return (
                  <div key={alloc.name} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 px-5 py-2.5 hover:bg-neutral-800/20">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                    <span className="text-sm text-neutral-200">{getRohstoffDisplayName(alloc.name)}</span>
                    <span className="tabular-nums text-sm text-emerald-400 text-right w-28">
                      {alloc.buyAmount > 0 ? formatAmount(alloc.buyAmount) : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-red-400 text-right w-28">
                      {alloc.sellAmount > 0 ? formatAmount(alloc.sellAmount) : "—"}
                    </span>
                    <span className="tabular-nums text-sm text-amber-400 text-right w-32">{formatAmount(alloc.totalAmount)}</span>
                    <span className="tabular-nums text-sm text-neutral-500 text-right w-14">{pct.toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {parseError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {parseError}
          </div>
        )}

        {dbLoading && !csvRows.length && (
          <p className="text-neutral-500 text-sm text-center">Lade Datenbank…</p>
        )}

        {/* Größte Positionen (alle CSV-Zeilen, sortiert nach Betrag, Buy/Sell, IBAN-Filter) */}
        {csvRows.length > 0 && (
          <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Größte Positionen ({aggregatedByIban.length})</span>
              <input
                type="text"
                value={ibanFilter}
                onChange={(e) => setIbanFilter(e.target.value)}
                placeholder="Suche"
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-amber-500 focus:outline-none w-40"
              />
            </div>
            <div className="overflow-x-auto max-h-[42rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-900 z-10">
                  <tr className="text-left text-neutral-500 border-b border-neutral-800">
                    <th className="px-5 py-3 font-normal">ISIN</th>
                    <th className="px-5 py-3 font-normal">Kürzel</th>
                    <th className="px-5 py-3 font-normal">Name</th>
                    <th className="px-5 py-3 font-normal text-right w-16">Trades</th>
                    <th className="px-5 py-3 font-normal text-right">Buy</th>
                    <th className="px-5 py-3 font-normal text-right">Sell</th>
                    <th className="px-5 py-3 font-normal text-right">Gesamt</th>
                    <th className="px-5 py-3 font-normal text-center w-24">Crypto</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedByIban.map((agg) => (
                    <Fragment key={agg.iban}>
                      <tr
                        onClick={() => setSelectedPosition(selectedPosition === agg.iban ? null : agg.iban)}
                        className={`border-b border-neutral-800/50 hover:bg-neutral-800/20 cursor-pointer transition-colors ${selectedPosition === agg.iban ? "bg-amber-500/10" : ""}`}
                      >
                        <td className="px-5 py-2 font-mono text-neutral-200 truncate max-w-[200px]">{agg.iban}</td>
                        <td className="px-5 py-2 font-mono text-neutral-400 text-sm">{agg.tickerDisplay}</td>
                        <td className="px-5 py-2 text-neutral-300 truncate max-w-[180px]" title={agg.nameDisplay}>{agg.nameDisplay}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{agg.count}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-emerald-400">{agg.buyAmount !== 0 ? formatAmount(agg.buyAmount) : "—"}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-red-400">{agg.sellAmount !== 0 ? formatAmount(agg.sellAmount) : "—"}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-amber-400">{formatAmount(agg.gesamt)}</td>
                        <td className="px-5 py-2 text-center">
                          {agg.etpLabel ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400 font-medium">
                              {agg.etpLabel}
                            </span>
                          ) : (
                            <span className="text-neutral-600">—</span>
                          )}
                        </td>
                      </tr>
                      {/* Einzelansicht: Trades direkt unter der angeklickten Zeile */}
                      {selectedPosition === agg.iban && selectedPositionTrades.length > 0 && (
                        <tr>
                          <td colSpan={8} className="p-0 align-top bg-neutral-900/80 border-b border-neutral-800/50">
                            <div className="px-5 py-3 flex justify-between items-center flex-wrap gap-2 border-b border-neutral-800/50">
                              <span className="text-sm text-neutral-400">
                                {selectedPositionTrades.length} Trades für {agg.iban}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedPosition(null); }}
                                className="text-xs text-neutral-500 hover:text-neutral-300"
                              >
                                Schließen
                              </button>
                            </div>
                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-neutral-900 z-10">
                                  <tr className="text-left text-neutral-500 border-b border-neutral-800">
                                    <th
                                      onClick={(e) => { e.stopPropagation(); setPositionSortBy("side"); setPositionSortDir((d) => (positionSortBy === "side" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                      className="px-5 py-2 font-normal cursor-pointer hover:text-neutral-400"
                                    >
                                      B/S {positionSortBy === "side" && (positionSortDir === "asc" ? "↑" : "↓")}
                                    </th>
                                    <th
                                      onClick={(e) => { e.stopPropagation(); setPositionSortBy("uhrzeit"); setPositionSortDir((d) => (positionSortBy === "uhrzeit" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                      className="px-5 py-2 font-normal cursor-pointer hover:text-neutral-400 w-20"
                                    >
                                      Uhrzeit {positionSortBy === "uhrzeit" && (positionSortDir === "asc" ? "↑" : "↓")}
                                    </th>
                                    <th
                                      onClick={(e) => { e.stopPropagation(); setPositionSortBy("kürzel"); setPositionSortDir((d) => (positionSortBy === "kürzel" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                      className="px-5 py-2 font-normal cursor-pointer hover:text-neutral-400"
                                    >
                                      Kürzel {positionSortBy === "kürzel" && (positionSortDir === "asc" ? "↑" : "↓")}
                                    </th>
                                    <th className="px-5 py-2 font-normal">Name</th>
                                    <th
                                      onClick={(e) => { e.stopPropagation(); setPositionSortBy("betrag"); setPositionSortDir((d) => (positionSortBy === "betrag" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                      className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                    >
                                      Betrag {positionSortBy === "betrag" && (positionSortDir === "asc" ? "↑" : "↓")}
                                    </th>
                                    <th className="px-5 py-2 font-normal text-center w-20">Crypto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedPositionTrades.map((row, idx) => {
                                    const dbEntry = dbEntries.find((d) => d.isin.toUpperCase() === row.isincod);
                                    const etpLabel = dbEntry
                                      ? dbEntry.constituents.length === 1
                                        ? (() => {
                                            const c = normalizeCoinName(dbEntry.constituents[0].name);
                                            return isRohstoff(c) ? getRohstoffDisplayName(c) : c;
                                          })()
                                        : "Basket"
                                      : null;
                                    return (
                                      <tr key={idx} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                                        <td className="px-5 py-2">
                                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${row.side === "B" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                            {row.side === "B" ? "Buy" : "Sell"}
                                          </span>
                                        </td>
                                        <td className="px-5 py-2 font-mono text-neutral-400 tabular-nums">{extractTimeFromTrandattim(row.trandattim)}</td>
                                        <td className="px-5 py-2 font-mono text-neutral-400">{row.instmnem || "—"}</td>
                                        <td className="px-5 py-2 text-neutral-300 truncate max-w-[160px]" title={row.instshtnam || dbEntry?.name}>{row.instshtnam || dbEntry?.name || "—"}</td>
                                        <td className="px-5 py-2 text-right tabular-nums text-neutral-200">{formatAmount(row.betrag)}</td>
                                        <td className="px-5 py-2 text-center">
                                          {etpLabel ? <span className="text-xs text-amber-400">{etpLabel}</span> : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <MusteranalyseSection csvRows={csvRows} />

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
