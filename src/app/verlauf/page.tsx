"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import Link from "next/link";
import PositionsTradesChartSection from "@/components/verlauf/PositionsTradesChartSection";
import CustomSelectDropdown from "@/components/ui/CustomSelectDropdown";

interface SnapshotCoin {
  name: string;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  pct: number;
}

interface SnapshotPositionTrade {
  side: "B" | "S";
  trandattim?: string;
  instmnem: string;
  instshtnam: string;
  betrag: number;
  ordrqty?: number;
  price?: number;
  etpLabel: string;
}

interface SnapshotPosition {
  iban: string;
  tickerDisplay: string;
  nameDisplay: string;
  count: number;
  buyAmount: number;
  sellAmount: number;
  gesamt: number;
  etpLabel: string;
  trades?: SnapshotPositionTrade[];
}

interface SnapshotCategorizedTrade {
  side: "B" | "S";
  trandattim?: string;
  instmnem: string;
  instshtnam: string;
  betrag: number;
  ordrqty?: number;
  price?: number;
}

interface SnapshotCategorizedPosition {
  positionKey: string;
  tickerDisplay: string;
  nameDisplay: string;
  direction: string;
  hebelHoehe: string;
  tradesCount: number;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  trades: SnapshotCategorizedTrade[];
}

interface SnapshotCategorizedAsset {
  name: string;
  direction: string | null;
  hebelHoehe: string;
  positionsCount: number;
  tradesCount: number;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  positions: SnapshotCategorizedPosition[];
}

interface Snapshot {
  id: string;
  snapshot_date: string;
  label: string | null;
  coins: SnapshotCoin[];
  positions?: SnapshotPosition[] | null;
  categorized_assets?: SnapshotCategorizedAsset[] | null;
  created_at: string;
}

const COLORS = [
  "#f59e0b","#22d3ee","#a78bfa","#34d399",
  "#f472b6","#fb923c","#60a5fa","#4ade80",
  "#e879f9","#f87171","#a3e635","#38bdf8",
];

/** Sortierung für Kategorisierte Assets: Rohstoff mit Partnern (Gold → Gold Hebel → Gold Short → Silber → …) */
const ROHSTOFF_ORDER = ["Gold", "Silber", "Öl"];
function sortCategorizedAssetsByRohstoff<T extends { name: string }>(assets: T[]): T[] {
  const baseIndex = (base: string) => {
    const i = ROHSTOFF_ORDER.indexOf(base);
    return i >= 0 ? i : ROHSTOFF_ORDER.length;
  };
  const getSortKey = (name: string) => {
    let base: string;
    let typeOrder: number;
    let hebel = 0;
    if (name.endsWith(" Short")) {
      base = name.slice(0, -6).trim();
      typeOrder = 2;
    } else {
      const hebelMatch = name.match(/\s([2345])x$/);
      if (hebelMatch) {
        base = name.slice(0, -3).trim();
        typeOrder = 1;
        hebel = parseInt(hebelMatch[1], 10);
      } else {
        base = name;
        typeOrder = 0;
      }
    }
    return [baseIndex(base), base, typeOrder, hebel] as const;
  };
  return [...assets].sort((a, b) => {
    const [idxA, baseA, typeA, hebelA] = getSortKey(a.name);
    const [idxB, baseB, typeB, hebelB] = getSortKey(b.name);
    if (idxA !== idxB) return idxA - idxB;
    if (baseA !== baseB) return baseA.localeCompare(baseB);
    if (typeA !== typeB) return typeA - typeB;
    return hebelA - hebelB;
  });
}

function formatAmount(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Ordermenge/Stückpreis: Komma als Dezimaltrenner, bis 4 Nachkommastellen, ,00 wenn ganzzahlig */
function formatDecimalDe(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
/** Ordermenge: ganzzahlig ohne ,00, sonst Komma mit Nachkommastellen */
function formatOrdrqty(n: number) {
  return n % 1 === 0
    ? n.toLocaleString("de-DE", { maximumFractionDigits: 0 })
    : n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 4 });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function extractTimeFromTrandattim(raw: string | undefined): string {
  if (!raw || !raw.trim()) return "—";
  const s = raw.trim();
  const timeOnly = s.match(/^\d{1,2}:\d{2}(:\d{2})?/);
  if (timeOnly) return timeOnly[0];
  const inStr = s.match(/\d{1,2}:\d{2}(:\d{2})?/);
  if (inStr) return inStr[0];
  const compact = s.match(/(\d{2})(\d{2})(\d{2})?$/);
  if (compact) return compact[3] ? `${compact[1]}:${compact[2]}:${compact[3]}` : `${compact[1]}:${compact[2]}`;
  return "—";
}

export default function VerlaufPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [chartMetric, setChartMetric] = useState<"pct" | "totalAmount" | "buyAmount" | "sellAmount">("pct");
  const [positionSearch, setPositionSearch] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [positionsPageSize, setPositionsPageSize] = useState<15 | 50 | 100>(15);
  const [positionsVisibleCount, setPositionsVisibleCount] = useState(15);
  const [tablePositionSortBy, setTablePositionSortBy] = useState<"gesamt" | "buyAmount" | "sellAmount" | "count">("gesamt");
  const [tablePositionSortOrder, setTablePositionSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedCategorized, setExpandedCategorized] = useState<Set<string>>(new Set());
  const [expandedCategorizedPosition, setExpandedCategorizedPosition] = useState<Set<string>>(new Set());
  const [categorizedPositionsSortBy, setCategorizedPositionsSortBy] = useState<"buyAmount" | "sellAmount" | "totalAmount">("totalAmount");
  const [categorizedPositionsSortDir, setCategorizedPositionsSortDir] = useState<"asc" | "desc">("desc");
  const [tradesSortBy, setTradesSortBy] = useState<"ordrqty" | "price" | "betrag">("betrag");
  const [tradesSortDir, setTradesSortDir] = useState<"asc" | "desc">("desc");
  const [expandedHebel, setExpandedHebel] = useState<Set<string>>(new Set());
  const [expandedHebelPosition, setExpandedHebelPosition] = useState<Set<string>>(new Set());

  const HEBEL_VALUES = ["5x", "4x", "3x", "2x"] as const;
  const getHebelFromStr = (s: string | null | undefined): string | null => {
    const h = (s ?? "").trim();
    if (!h) return null;
    for (const v of HEBEL_VALUES) {
      if (h.includes(v)) return v;
    }
    return null;
  };

  const hebelAssets = useMemo(() => {
    const cat = selectedSnapshot?.categorized_assets ?? [];
    const map = new Map<string, SnapshotCategorizedAsset>();
    for (const alloc of cat) {
      for (const pos of alloc.positions ?? []) {
        const hebel = getHebelFromStr(pos.hebelHoehe);
        if (!hebel) continue;
        const dir = (pos.direction ?? alloc.direction ?? "").trim().toLowerCase();
        const dirDisplay = dir ? dir.charAt(0).toUpperCase() + dir.slice(1) : "—";
        const name = `${hebel} ${dirDisplay}`;
        if (!map.has(name)) {
          map.set(name, {
            name,
            direction: alloc.direction,
            hebelHoehe: hebel,
            positionsCount: 0,
            tradesCount: 0,
            buyAmount: 0,
            sellAmount: 0,
            totalAmount: 0,
            positions: [],
          });
        }
        const agg = map.get(name)!;
        agg.positionsCount += 1;
        agg.tradesCount += pos.tradesCount ?? 0;
        agg.buyAmount += pos.buyAmount ?? 0;
        agg.sellAmount += pos.sellAmount ?? 0;
        agg.totalAmount += pos.totalAmount ?? 0;
        agg.positions!.push(pos);
      }
    }
    const order = ["2x Long", "2x Short", "3x Long", "3x Short", "4x Long", "4x Short", "5x Long", "5x Short"];
    return Array.from(map.values()).sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
    });
  }, [selectedSnapshot?.categorized_assets, selectedSnapshot?.id]);

  useEffect(() => {
    setPositionSearch("");
    setSelectedPosition(null);
    setExpandedCategorized(new Set());
    setExpandedCategorizedPosition(new Set());
  }, [selectedSnapshot?.id]);

  useEffect(() => {
    setPositionsVisibleCount(positionsPageSize);
  }, [positionsPageSize, selectedSnapshot?.id, positionSearch]);

  useEffect(() => {
    fetch("/api/snapshots")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        const list: Snapshot[] = Array.isArray(data) ? data : [];
        setSnapshots(list);
        if (list.length > 0) setSelectedSnapshot(list[0]);
      })
      .catch(() => setError("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  // Gefilterte Positionen nach Kürzel/ISIN-Suche
  const filteredPositions = useMemo(() => {
    if (!selectedSnapshot?.positions) return [];
    const q = positionSearch.trim().toLowerCase();
    if (!q) return selectedSnapshot.positions;
    return selectedSnapshot.positions.filter(
      (p) =>
        (p.iban ?? "").toLowerCase().includes(q) ||
        (p.tickerDisplay ?? "").toLowerCase().includes(q) ||
        (p.nameDisplay ?? "").toLowerCase().includes(q)
    );
  }, [selectedSnapshot?.positions, positionSearch]);

  // Sortierte Positionen für Tabelle
  const sortedFilteredPositions = useMemo(() => {
    const dir = tablePositionSortOrder === "asc" ? 1 : -1;
    const key = tablePositionSortBy;
    return [...filteredPositions].sort((a, b) => dir * ((b[key] ?? 0) - (a[key] ?? 0)));
  }, [filteredPositions, tablePositionSortBy, tablePositionSortOrder]);

  // Alle einzigartigen Coins über alle Snapshots
  const allCoins = useMemo(() => {
    const set = new Set<string>();
    snapshots.forEach((s) => s.coins.forEach((c) => set.add(c.name)));
    return Array.from(set).sort();
  }, [snapshots]);

  // Verlaufs-Daten für einen bestimmten Coin (älteste zuerst für Chart)
  const coinHistory = useMemo(() => {
    if (!selectedCoin) return [];
    return [...snapshots]
      .reverse()
      .map((s) => ({
        snapshot: s,
        coin: s.coins.find((c) => c.name === selectedCoin) ?? null,
      }))
      .filter((e) => e.coin !== null);
  }, [selectedCoin, snapshots]);

  // Max-Wert für Skalierung
  const chartMax = useMemo(() => {
    if (coinHistory.length === 0) return 1;
    return Math.max(...coinHistory.map((e) => Math.abs(e.coin![chartMetric])), 0.01);
  }, [coinHistory, chartMetric]);

  const metricLabel: Record<typeof chartMetric, string> = {
    pct: "Anteil %",
    totalAmount: "Gesamt",
    buyAmount: "Buy",
    sellAmount: "Sell",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p className="text-neutral-400">Lade Verlauf…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased">
      <div className="mx-auto max-w-screen-2xl px-6 py-12">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {error}
            {error.includes("existiert nicht") && (
              <p className="mt-2 text-xs text-neutral-400">
                Bitte folgende SQL-Migration in Supabase ausführen:
                <code className="block mt-1 bg-neutral-800 rounded p-2 text-xs font-mono whitespace-pre">
{`CREATE TABLE portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  label text,
  coins jsonb NOT NULL,
  positions jsonb,
  created_at timestamptz DEFAULT now()
);

-- Falls die Tabelle schon existiert, nur die Spalte hinzufügen:
-- ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS positions jsonb;`}
                </code>
              </p>
            )}
          </div>
        )}

        {!error && snapshots.length === 0 && (
          <p className="text-neutral-500 text-sm">
            Noch keine Einträge. Auswertung durchführen und speichern.
          </p>
        )}

        {snapshots.length > 0 && (
          <>
            <PositionsTradesChartSection
              snapshots={snapshots}
              selectedSnapshot={selectedSnapshot}
              onSelectedSnapshotChange={setSelectedSnapshot}
            />
          <div className="space-y-6">

              {/* Snapshot-Details */}
              {selectedSnapshot && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center flex-wrap gap-2">
                    <span className="text-sm text-neutral-200 font-medium">
                      {formatDate(selectedSnapshot.snapshot_date)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {selectedSnapshot.coins.length} Coins · gespeichert {new Date(selectedSnapshot.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>

                  {/* Balkendiagramm Snapshot */}
                  <div className="px-5 py-4 border-b border-neutral-800">
                    <div className="h-6 rounded-lg overflow-hidden flex">
                      {[...selectedSnapshot.coins]
                        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                        .map((c, i) => (
                          <div
                            key={c.name}
                            style={{ width: `${Math.abs(c.pct)}%`, backgroundColor: COLORS[i % COLORS.length], minWidth: c.pct > 0.3 ? "2px" : "0" }}
                            title={`${c.name}: ${c.pct.toFixed(1)}%`}
                          />
                        ))}
                    </div>
                  </div>

                  {/* Coin-Tabelle: 2 pro Zeile, kleinerer Text */}
                  <div className="border-b border-neutral-800 px-5 py-3">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      {[...selectedSnapshot.coins]
                        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                        .map((c, i) => (
                          <div
                            key={c.name}
                            className="flex items-center justify-between gap-2 py-1.5 border-b border-neutral-800/40 hover:bg-neutral-800/20 rounded px-2 -mx-2"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 shrink">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <span className="text-neutral-200 truncate">{c.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="text-emerald-400">{formatAmount(c.buyAmount)}</span>
                              <span className="text-red-400">{formatAmount(c.sellAmount)}</span>
                              <span className="text-amber-400">{formatAmount(c.totalAmount)}</span>
                              <span className="text-neutral-400 w-11 text-right">{c.pct.toFixed(2)}%</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Größte Positionen (eigene Sektion) */}
              {selectedSnapshot?.positions && selectedSnapshot.positions.length > 0 && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                      <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-base font-medium text-white">Größte Positionen (Gesamt: {filteredPositions.length})</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={positionSearch}
                            onChange={(e) => setPositionSearch(e.target.value)}
                            placeholder="Suche Kürzel/ISIN"
                            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-amber-500 focus:outline-none w-40"
                          />
                          <span className="text-xs text-neutral-500">Anzeigen:</span>
                          <CustomSelectDropdown
                            value={String(positionsPageSize)}
                            onChange={(v) => setPositionsPageSize(Number(v) as 15 | 50 | 100)}
                            options={[
                              { value: "15", label: "15" },
                              { value: "50", label: "50" },
                              { value: "100", label: "100" },
                            ]}
                            placeholder="15"
                            minWidth="60px"
                          />
                          {positionsVisibleCount < filteredPositions.length && (
                            <button
                              type="button"
                              onClick={() => setPositionsVisibleCount((n) => Math.min(n + positionsPageSize, filteredPositions.length))}
                              className="rounded-lg border border-neutral-700 bg-neutral-800/80 px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700/80 transition-colors"
                            >
                              Weiter ({Math.min(positionsPageSize, filteredPositions.length - positionsVisibleCount)} mehr)
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-neutral-900 z-10">
                            <tr className="text-left text-neutral-500 border-b border-neutral-800">
                              <th className="px-5 py-3 font-normal">ISIN</th>
                              <th className="px-5 py-3 font-normal">Kürzel</th>
                              <th className="px-5 py-3 font-normal">Name</th>
                              <th
                                className="px-5 py-3 font-normal text-right w-16 cursor-pointer hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors select-none"
                                onClick={() => {
                                  setTablePositionSortBy("count");
                                  setTablePositionSortOrder((prev) => (tablePositionSortBy === "count" ? (prev === "desc" ? "asc" : "desc") : "desc"));
                                }}
                              >
                                Trades{tablePositionSortBy === "count" && (tablePositionSortOrder === "desc" ? " ↓" : " ↑")}
                              </th>
                              <th
                                className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors select-none"
                                onClick={() => {
                                  setTablePositionSortBy("buyAmount");
                                  setTablePositionSortOrder((prev) => (tablePositionSortBy === "buyAmount" ? (prev === "desc" ? "asc" : "desc") : "desc"));
                                }}
                              >
                                Buy{tablePositionSortBy === "buyAmount" && (tablePositionSortOrder === "desc" ? " ↓" : " ↑")}
                              </th>
                              <th
                                className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors select-none"
                                onClick={() => {
                                  setTablePositionSortBy("sellAmount");
                                  setTablePositionSortOrder((prev) => (tablePositionSortBy === "sellAmount" ? (prev === "desc" ? "asc" : "desc") : "desc"));
                                }}
                              >
                                Sell{tablePositionSortBy === "sellAmount" && (tablePositionSortOrder === "desc" ? " ↓" : " ↑")}
                              </th>
                              <th className="px-5 py-3 font-normal text-right">Gesamt</th>
                              <th className="px-5 py-3 font-normal text-center w-24">Typ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedFilteredPositions.slice(0, positionsVisibleCount).map((pos) => {
                              const trades = pos.trades ?? [];
                              const isExpanded = selectedPosition === pos.iban;
                              return (
                                <Fragment key={pos.iban}>
                                  <tr
                                    onClick={() => setSelectedPosition(isExpanded ? null : pos.iban)}
                                    className={`border-b border-neutral-800/50 hover:bg-neutral-800/20 cursor-pointer transition-colors ${isExpanded ? "bg-amber-500/10" : ""}`}
                                  >
                                    <td className="px-5 py-2 font-mono text-neutral-200 truncate max-w-[200px]">{pos.iban}</td>
                                    <td className="px-5 py-2 font-mono text-neutral-400 text-sm">{pos.tickerDisplay}</td>
                                    <td className="px-5 py-2 text-neutral-300 truncate max-w-[180px]" title={pos.nameDisplay}>{pos.nameDisplay}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{pos.count}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-emerald-400">{pos.buyAmount !== 0 ? formatAmount(pos.buyAmount) : "—"}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-red-400">{pos.sellAmount !== 0 ? formatAmount(pos.sellAmount) : "—"}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-amber-400">{formatAmount(pos.gesamt)}</td>
                                    <td className="px-5 py-2 text-center">
                                      {pos.etpLabel ? (
                                        <span className={`inline-block px-2 py-0.5 rounded whitespace-nowrap bg-amber-500/15 text-amber-400 font-medium ${/ [2345]x$/.test(pos.etpLabel) ? "text-[10px]" : "text-xs"}`}>
                                          {pos.etpLabel}
                                        </span>
                                      ) : (
                                        <span className="text-neutral-600">—</span>
                                      )}
                                    </td>
                                  </tr>
                                  {isExpanded && trades.length > 0 && (
                                    <tr>
                                      <td colSpan={8} className="p-0 align-top bg-neutral-900/80 border-b border-neutral-800/50">
                                        <div className="px-5 py-3 flex justify-between items-center flex-wrap gap-2 border-b border-neutral-800/50">
                                          <span className="text-sm text-neutral-400">
                                            {trades.length} Trades für {pos.iban}
                                          </span>
                                          <button
                                            type="button"
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
                                                <th className="px-5 py-2 font-normal">B/S</th>
                                                <th className="px-5 py-2 font-normal w-20">Uhrzeit</th>
                                                <th className="px-5 py-2 font-normal">Kürzel</th>
                                                <th className="px-5 py-2 font-normal">Name</th>
                                                <th
                                                  onClick={(e) => { e.stopPropagation(); setTradesSortBy("ordrqty"); setTradesSortDir((d) => (tradesSortBy === "ordrqty" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                                  className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-300"
                                                >
                                                  Ordermenge {tradesSortBy === "ordrqty" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                </th>
                                                <th
                                                  onClick={(e) => { e.stopPropagation(); setTradesSortBy("price"); setTradesSortDir((d) => (tradesSortBy === "price" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                                  className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-300"
                                                >
                                                  Stückpreis {tradesSortBy === "price" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                </th>
                                                <th
                                                  onClick={(e) => { e.stopPropagation(); setTradesSortBy("betrag"); setTradesSortDir((d) => (tradesSortBy === "betrag" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                  className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-300"
                                                >
                                                  Betrag {tradesSortBy === "betrag" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                </th>
                                                <th className="px-5 py-2 font-normal text-center w-20">Typ</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {[...trades]
                                                .sort((a, b) => {
                                                  const mul = tradesSortDir === "asc" ? 1 : -1;
                                                  if (tradesSortBy === "ordrqty") return mul * ((a.ordrqty ?? 0) - (b.ordrqty ?? 0));
                                                  if (tradesSortBy === "price") return mul * ((a.price ?? 0) - (b.price ?? 0));
                                                  return mul * (Math.abs(a.betrag) - Math.abs(b.betrag));
                                                })
                                                .map((t, idx) => (
                                                <tr key={idx} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                                                  <td className="px-5 py-2">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${t.side === "B" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                                      {t.side === "B" ? "Buy" : "Sell"}
                                                    </span>
                                                  </td>
                                                  <td className="px-5 py-2 font-mono text-neutral-400 tabular-nums">{extractTimeFromTrandattim(t.trandattim)}</td>
                                                  <td className="px-5 py-2 font-mono text-neutral-400">{t.instmnem || "—"}</td>
                                                  <td className="px-5 py-2 text-neutral-300 truncate max-w-[160px]" title={t.instshtnam}>{t.instshtnam || "—"}</td>
                                                  <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{t.ordrqty != null ? formatOrdrqty(t.ordrqty) : "—"}</td>
                                                  <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{t.price != null ? formatDecimalDe(t.price) : "—"}</td>
                                                  <td className="px-5 py-2 text-right tabular-nums text-neutral-200">{formatDecimalDe(t.betrag)}</td>
                                                  <td className="px-5 py-2 text-center">
                                                    {t.etpLabel ? <span className={`whitespace-nowrap text-amber-400 ${/ [2345]x$/.test(t.etpLabel) ? "text-[10px]" : "text-xs"}`}>{t.etpLabel}</span> : "—"}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {isExpanded && trades.length === 0 && (
                                    <tr>
                                      <td colSpan={8} className="px-5 py-3 text-sm text-neutral-500 bg-neutral-900/80 border-b border-neutral-800/50">
                                        Keine Detail-Trades für diese Position gespeichert (Snapshot vor Update erstellt).
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Kategorisierte Assets (eigene Sektion) */}
                  {selectedSnapshot?.categorized_assets && selectedSnapshot.categorized_assets.length > 0 && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                      <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-base font-medium text-white">Kategorisierte Assets ({selectedSnapshot.categorized_assets.reduce((s, a) => s + (a.tradesCount ?? 0), 0)})</span>
                        <span className="text-sm text-neutral-500 flex items-center gap-4">
                          <span>Buy: <span className="text-emerald-400 tabular-nums">{formatAmount(selectedSnapshot.categorized_assets.reduce((s, a) => s + a.buyAmount, 0))}</span></span>
                          <span>Sell: <span className="text-red-400 tabular-nums">{formatAmount(selectedSnapshot.categorized_assets.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
                          <span>Gesamt: <span className="text-amber-400 tabular-nums">{formatAmount(selectedSnapshot.categorized_assets.reduce((s, a) => s + a.totalAmount, 0))}</span></span>
                        </span>
                      </div>
                      <div className="overflow-x-auto max-h-[42rem] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-neutral-900 z-10">
                            <tr className="text-left text-neutral-500 border-b border-neutral-800">
                              <th className="px-5 py-3 font-normal">Rohstoff/Art</th>
                              <th className="px-5 py-3 font-normal w-20">Direction</th>
                              <th className="px-5 py-3 font-normal w-16">Hebel</th>
                              <th className="px-5 py-3 font-normal text-right w-16">Pos.</th>
                              <th className="px-5 py-3 font-normal text-right w-20">Trades</th>
                              <th className="px-5 py-3 font-normal text-right">Buy</th>
                              <th className="px-5 py-3 font-normal text-right">Sell</th>
                              <th className="px-5 py-3 font-normal text-right">Gesamt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortCategorizedAssetsByRohstoff(selectedSnapshot.categorized_assets).map((alloc) => {
                              const isExpanded = expandedCategorized.has(alloc.name);
                              return (
                                <Fragment key={alloc.name}>
                                  <tr
                                    onClick={() => setExpandedCategorized((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(alloc.name)) {
                                        next.delete(alloc.name);
                                        setExpandedCategorizedPosition((p) => {
                                          const n = new Set(p);
                                          for (const k of n) if (k.startsWith(alloc.name + "|")) n.delete(k);
                                          return n;
                                        });
                                      } else next.add(alloc.name);
                                      return next;
                                    })}
                                    className={`border-b border-neutral-800/50 hover:bg-neutral-800/20 cursor-pointer transition-colors ${isExpanded ? "bg-amber-500/10" : ""}`}
                                  >
                                    <td className="px-5 py-2 text-neutral-200 font-medium">{alloc.name}</td>
                                    <td className="px-5 py-2 text-neutral-400">{alloc.direction || "—"}</td>
                                    <td className="px-5 py-2 text-neutral-400 whitespace-nowrap" title={alloc.hebelHoehe}>{alloc.hebelHoehe}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{alloc.positionsCount}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{alloc.tradesCount}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-emerald-400">{alloc.buyAmount > 0 ? formatAmount(alloc.buyAmount) : "—"}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-red-400">{alloc.sellAmount > 0 ? formatAmount(alloc.sellAmount) : "—"}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-amber-400">{formatAmount(alloc.totalAmount)}</td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={8} className="p-0 align-top bg-neutral-900/80 border-b border-neutral-800/50">
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-sm">
                                            <thead className="bg-neutral-900 sticky top-0 z-10">
                                              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                                                <th className="px-5 py-3 font-normal">ISIN</th>
                                                <th className="px-5 py-3 font-normal">Kürzel</th>
                                                <th className="px-5 py-3 font-normal">Name</th>
                                                <th className="px-5 py-3 font-normal w-20">Direction</th>
                                                <th className="px-5 py-3 font-normal w-16">Hebel</th>
                                                <th className="px-5 py-3 font-normal text-right w-16">Trades</th>
                                                <th
                                                  className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-400 select-none"
                                                  onClick={(e) => { e.stopPropagation(); setCategorizedPositionsSortBy("buyAmount"); setCategorizedPositionsSortDir((d) => (categorizedPositionsSortBy === "buyAmount" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                >
                                                  Buy{categorizedPositionsSortBy === "buyAmount" && (categorizedPositionsSortDir === "asc" ? " ↑" : " ↓")}
                                                </th>
                                                <th
                                                  className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-400 select-none"
                                                  onClick={(e) => { e.stopPropagation(); setCategorizedPositionsSortBy("sellAmount"); setCategorizedPositionsSortDir((d) => (categorizedPositionsSortBy === "sellAmount" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                >
                                                  Sell{categorizedPositionsSortBy === "sellAmount" && (categorizedPositionsSortDir === "asc" ? " ↑" : " ↓")}
                                                </th>
                                                <th
                                                  className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-400 select-none"
                                                  onClick={(e) => { e.stopPropagation(); setCategorizedPositionsSortBy("totalAmount"); setCategorizedPositionsSortDir((d) => (categorizedPositionsSortBy === "totalAmount" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                >
                                                  Gesamt{categorizedPositionsSortBy === "totalAmount" && (categorizedPositionsSortDir === "asc" ? " ↑" : " ↓")}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {[...(alloc.positions ?? [])]
                                                .sort((a, b) => {
                                                  const mul = categorizedPositionsSortDir === "asc" ? 1 : -1;
                                                  if (categorizedPositionsSortBy === "buyAmount") return mul * ((a.buyAmount ?? 0) - (b.buyAmount ?? 0));
                                                  if (categorizedPositionsSortBy === "sellAmount") return mul * ((a.sellAmount ?? 0) - (b.sellAmount ?? 0));
                                                  return mul * (Math.abs(b.totalAmount ?? 0) - Math.abs(a.totalAmount ?? 0));
                                                })
                                                .map((pos) => {
                                                const posKey = `${alloc.name}|${pos.positionKey}`;
                                                const isPosExpanded = expandedCategorizedPosition.has(posKey);
                                                return (
                                                  <Fragment key={pos.positionKey}>
                                                    <tr
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedCategorizedPosition((prev) => {
                                                          const next = new Set(prev);
                                                          if (next.has(posKey)) next.delete(posKey);
                                                          else next.add(posKey);
                                                          return next;
                                                        });
                                                      }}
                                                      className={"border-b border-neutral-800/50 hover:bg-neutral-800/20 cursor-pointer transition-colors" + (isPosExpanded ? " bg-amber-500/10" : "")}
                                                    >
                                                      <td className="px-5 py-2 font-mono text-neutral-200 truncate max-w-[200px]">{pos.positionKey}</td>
                                                      <td className="px-5 py-2 font-mono text-neutral-400 text-sm">{pos.tickerDisplay || "—"}</td>
                                                      <td className="px-5 py-2 text-neutral-300 truncate max-w-[180px]" title={pos.nameDisplay}>{pos.nameDisplay || "—"}</td>
                                                      <td className="px-5 py-2 text-neutral-400">{pos.direction || "—"}</td>
                                                      <td className="px-5 py-2 text-neutral-400 whitespace-nowrap" title={pos.hebelHoehe}>{pos.hebelHoehe}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{pos.tradesCount}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-emerald-400">{pos.buyAmount > 0 ? formatAmount(pos.buyAmount) : "—"}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-red-400">{pos.sellAmount > 0 ? formatAmount(pos.sellAmount) : "—"}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-amber-400">{formatAmount(pos.totalAmount)}</td>
                                                    </tr>
                                                    {isPosExpanded && (
                                                      <tr>
                                                        <td colSpan={9} className="p-0 align-top bg-neutral-900/80 border-b border-neutral-800/50">
                                                          <div className="px-5 py-3 flex justify-between items-center flex-wrap gap-2 border-b border-neutral-800/50">
                                                            <span className="text-sm text-neutral-400">
                                                              {pos.tradesCount} Trades für {pos.tickerDisplay || "—"} &nbsp; · &nbsp; {pos.positionKey} &nbsp; · &nbsp; {pos.nameDisplay || "—"}
                                                            </span>
                                                            <button
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedCategorizedPosition((p) => {
                                                                  const n = new Set(p);
                                                                  n.delete(posKey);
                                                                  return n;
                                                                });
                                                              }}
                                                              className="text-xs text-neutral-500 hover:text-neutral-300"
                                                            >
                                                              Schließen
                                                            </button>
                                                          </div>
                                                          <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                                            <table className="w-full text-sm">
                                                              <thead className="sticky top-0 bg-neutral-900 z-10">
                                                                <tr className="text-left text-neutral-500 border-b border-neutral-800">
                                                                  <th className="px-5 py-2 font-normal">B/S</th>
                                                                  <th className="px-5 py-2 font-normal w-20">Uhrzeit</th>
                                                                  <th className="px-5 py-2 font-normal">Kürzel</th>
                                                                  <th className="px-5 py-2 font-normal">Name</th>
                                                                  <th
                                                                    onClick={(e) => { e.stopPropagation(); setTradesSortBy("ordrqty"); setTradesSortDir((d) => (tradesSortBy === "ordrqty" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                                                    className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                                                  >
                                                                    Ordermenge {tradesSortBy === "ordrqty" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                                  </th>
                                                                  <th
                                                                    onClick={(e) => { e.stopPropagation(); setTradesSortBy("price"); setTradesSortDir((d) => (tradesSortBy === "price" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                                                    className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                                                  >
                                                                    Stückpreis {tradesSortBy === "price" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                                  </th>
                                                                  <th
                                                                    onClick={(e) => { e.stopPropagation(); setTradesSortBy("betrag"); setTradesSortDir((d) => (tradesSortBy === "betrag" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                                    className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                                                  >
                                                                    Betrag {tradesSortBy === "betrag" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                                  </th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {[...pos.trades]
                                                                  .sort((a, b) => {
                                                                    const mul = tradesSortDir === "asc" ? 1 : -1;
                                                                    if (tradesSortBy === "ordrqty") return mul * ((a.ordrqty ?? 0) - (b.ordrqty ?? 0));
                                                                    if (tradesSortBy === "price") return mul * ((a.price ?? 0) - (b.price ?? 0));
                                                                    return mul * (Math.abs(a.betrag) - Math.abs(b.betrag));
                                                                  })
                                                                  .map((t, idx) => (
                                                                  <tr key={idx} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                                                                    <td className="px-5 py-2">
                                                                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${t.side === "B" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                                                        {t.side === "B" ? "Buy" : "Sell"}
                                                                      </span>
                                                                    </td>
                                                                    <td className="px-5 py-2 font-mono text-neutral-400 tabular-nums">{extractTimeFromTrandattim(t.trandattim)}</td>
                                                                    <td className="px-5 py-2 font-mono text-neutral-400">{t.instmnem || "—"}</td>
                                                                    <td className="px-5 py-2 text-neutral-300 truncate max-w-[160px]" title={t.instshtnam}>{t.instshtnam || "—"}</td>
                                                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{t.ordrqty != null ? formatOrdrqty(t.ordrqty) : "—"}</td>
                                                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{t.price != null ? formatDecimalDe(t.price) : "—"}</td>
                                                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-200">{formatDecimalDe(t.betrag)}</td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    )}
                                                  </Fragment>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Hebel Produkte (eigene Sektion) */}
                  {hebelAssets.length > 0 && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                      <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-base font-medium text-white">Hebel Produkte ({hebelAssets.reduce((s, a) => s + (a.tradesCount ?? 0), 0)})</span>
                        <span className="text-sm text-neutral-500 flex items-center gap-4">
                          <span>Buy: <span className="text-emerald-400 tabular-nums">{formatAmount(hebelAssets.reduce((s, a) => s + a.buyAmount, 0))}</span></span>
                          <span>Sell: <span className="text-red-400 tabular-nums">{formatAmount(hebelAssets.reduce((s, a) => s + a.sellAmount, 0))}</span></span>
                          <span>Gesamt: <span className="text-amber-400 tabular-nums">{formatAmount(hebelAssets.reduce((s, a) => s + a.totalAmount, 0))}</span></span>
                        </span>
                      </div>
                      <div className="overflow-x-auto max-h-[42rem] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-neutral-900 z-10">
                            <tr className="text-left text-neutral-500 border-b border-neutral-800">
                              <th className="px-5 py-3 font-normal">Hebel</th>
                              <th className="px-5 py-3 font-normal w-16">Hebel</th>
                              <th className="px-5 py-3 font-normal text-right w-16">Pos.</th>
                              <th className="px-5 py-3 font-normal text-right w-20">Trades</th>
                              <th className="px-5 py-3 font-normal text-right">Buy</th>
                              <th className="px-5 py-3 font-normal text-right">Sell</th>
                              <th className="px-5 py-3 font-normal text-right">Gesamt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hebelAssets.map((alloc) => {
                              const isExpanded = expandedHebel.has(alloc.name);
                              return (
                                <Fragment key={alloc.name}>
                                  <tr
                                    onClick={() => setExpandedHebel((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(alloc.name)) {
                                        next.delete(alloc.name);
                                        setExpandedHebelPosition((p) => {
                                          const n = new Set(p);
                                          for (const k of n) if (k.startsWith(alloc.name + "|")) n.delete(k);
                                          return n;
                                        });
                                      } else next.add(alloc.name);
                                      return next;
                                    })}
                                    className={`border-b border-neutral-800/50 hover:bg-neutral-800/20 cursor-pointer transition-colors ${isExpanded ? "bg-amber-500/10" : ""}`}
                                  >
                                    <td className="px-5 py-2 text-neutral-200 font-medium">{alloc.name}</td>
                                    <td className="px-5 py-2 text-neutral-400 whitespace-nowrap" title={alloc.hebelHoehe}>{alloc.hebelHoehe}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{alloc.positionsCount}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{alloc.tradesCount}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-emerald-400">{alloc.buyAmount > 0 ? formatAmount(alloc.buyAmount) : "—"}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-red-400">{alloc.sellAmount > 0 ? formatAmount(alloc.sellAmount) : "—"}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-amber-400">{formatAmount(alloc.totalAmount)}</td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={7} className="p-0 align-top bg-neutral-900/80 border-b border-neutral-800/50">
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-sm">
                                            <thead className="bg-neutral-900 sticky top-0 z-10">
                                              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                                                <th className="px-5 py-3 font-normal">ISIN</th>
                                                <th className="px-5 py-3 font-normal">Kürzel</th>
                                                <th className="px-5 py-3 font-normal">Name</th>
                                                <th className="px-5 py-3 font-normal w-20">Direction</th>
                                                <th className="px-5 py-3 font-normal w-16">Hebel</th>
                                                <th className="px-5 py-3 font-normal text-right w-16">Trades</th>
                                                <th
                                                  className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-400 select-none"
                                                  onClick={(e) => { e.stopPropagation(); setCategorizedPositionsSortBy("buyAmount"); setCategorizedPositionsSortDir((d) => (categorizedPositionsSortBy === "buyAmount" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                >
                                                  Buy{categorizedPositionsSortBy === "buyAmount" && (categorizedPositionsSortDir === "asc" ? " ↑" : " ↓")}
                                                </th>
                                                <th
                                                  className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-400 select-none"
                                                  onClick={(e) => { e.stopPropagation(); setCategorizedPositionsSortBy("sellAmount"); setCategorizedPositionsSortDir((d) => (categorizedPositionsSortBy === "sellAmount" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                >
                                                  Sell{categorizedPositionsSortBy === "sellAmount" && (categorizedPositionsSortDir === "asc" ? " ↑" : " ↓")}
                                                </th>
                                                <th
                                                  className="px-5 py-3 font-normal text-right cursor-pointer hover:text-neutral-400 select-none"
                                                  onClick={(e) => { e.stopPropagation(); setCategorizedPositionsSortBy("totalAmount"); setCategorizedPositionsSortDir((d) => (categorizedPositionsSortBy === "totalAmount" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                >
                                                  Gesamt{categorizedPositionsSortBy === "totalAmount" && (categorizedPositionsSortDir === "asc" ? " ↑" : " ↓")}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {[...(alloc.positions ?? [])]
                                                .sort((a, b) => {
                                                  const mul = categorizedPositionsSortDir === "asc" ? 1 : -1;
                                                  if (categorizedPositionsSortBy === "buyAmount") return mul * ((a.buyAmount ?? 0) - (b.buyAmount ?? 0));
                                                  if (categorizedPositionsSortBy === "sellAmount") return mul * ((a.sellAmount ?? 0) - (b.sellAmount ?? 0));
                                                  return mul * (Math.abs(b.totalAmount ?? 0) - Math.abs(a.totalAmount ?? 0));
                                                })
                                                .map((pos) => {
                                                const posKey = `${alloc.name}|${pos.positionKey}`;
                                                const isPosExpanded = expandedHebelPosition.has(posKey);
                                                return (
                                                  <Fragment key={pos.positionKey}>
                                                    <tr
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedHebelPosition((prev) => {
                                                          const next = new Set(prev);
                                                          if (next.has(posKey)) next.delete(posKey);
                                                          else next.add(posKey);
                                                          return next;
                                                        });
                                                      }}
                                                      className={"border-b border-neutral-800/50 hover:bg-neutral-800/20 cursor-pointer transition-colors" + (isPosExpanded ? " bg-amber-500/10" : "")}
                                                    >
                                                      <td className="px-5 py-2 font-mono text-neutral-200 truncate max-w-[200px]">{pos.positionKey}</td>
                                                      <td className="px-5 py-2 font-mono text-neutral-400 text-sm">{pos.tickerDisplay || "—"}</td>
                                                      <td className="px-5 py-2 text-neutral-300 truncate max-w-[180px]" title={pos.nameDisplay}>{pos.nameDisplay || "—"}</td>
                                                      <td className="px-5 py-2 text-neutral-400">{pos.direction || "—"}</td>
                                                      <td className="px-5 py-2 text-neutral-400 whitespace-nowrap" title={pos.hebelHoehe}>{pos.hebelHoehe}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{pos.tradesCount}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-emerald-400">{pos.buyAmount > 0 ? formatAmount(pos.buyAmount) : "—"}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-red-400">{pos.sellAmount > 0 ? formatAmount(pos.sellAmount) : "—"}</td>
                                                      <td className="px-5 py-2 text-right tabular-nums text-amber-400">{formatAmount(pos.totalAmount)}</td>
                                                    </tr>
                                                    {isPosExpanded && (
                                                      <tr>
                                                        <td colSpan={9} className="p-0 align-top bg-neutral-900/80 border-b border-neutral-800/50">
                                                          <div className="px-5 py-3 flex justify-between items-center flex-wrap gap-2 border-b border-neutral-800/50">
                                                            <span className="text-sm text-neutral-400">
                                                              {pos.tradesCount} Trades für {pos.tickerDisplay || "—"} &nbsp; · &nbsp; {pos.positionKey} &nbsp; · &nbsp; {pos.nameDisplay || "—"}
                                                            </span>
                                                            <button
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedHebelPosition((p) => {
                                                                  const n = new Set(p);
                                                                  n.delete(posKey);
                                                                  return n;
                                                                });
                                                              }}
                                                              className="text-xs text-neutral-500 hover:text-neutral-300"
                                                            >
                                                              Schließen
                                                            </button>
                                                          </div>
                                                          <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                                            <table className="w-full text-sm">
                                                              <thead className="sticky top-0 bg-neutral-900 z-10">
                                                                <tr className="text-left text-neutral-500 border-b border-neutral-800">
                                                                  <th className="px-5 py-2 font-normal">B/S</th>
                                                                  <th className="px-5 py-2 font-normal w-20">Uhrzeit</th>
                                                                  <th className="px-5 py-2 font-normal">Kürzel</th>
                                                                  <th className="px-5 py-2 font-normal">Name</th>
                                                                  <th
                                                                    onClick={(e) => { e.stopPropagation(); setTradesSortBy("ordrqty"); setTradesSortDir((d) => (tradesSortBy === "ordrqty" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                                                    className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                                                  >
                                                                    Ordermenge {tradesSortBy === "ordrqty" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                                  </th>
                                                                  <th
                                                                    onClick={(e) => { e.stopPropagation(); setTradesSortBy("price"); setTradesSortDir((d) => (tradesSortBy === "price" ? (d === "asc" ? "desc" : "asc") : "asc")); }}
                                                                    className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                                                  >
                                                                    Stückpreis {tradesSortBy === "price" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                                  </th>
                                                                  <th
                                                                    onClick={(e) => { e.stopPropagation(); setTradesSortBy("betrag"); setTradesSortDir((d) => (tradesSortBy === "betrag" ? (d === "asc" ? "desc" : "asc") : "desc")); }}
                                                                    className="px-5 py-2 font-normal text-right cursor-pointer hover:text-neutral-400"
                                                                  >
                                                                    Betrag {tradesSortBy === "betrag" && (tradesSortDir === "asc" ? "↑" : "↓")}
                                                                  </th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {[...(pos.trades ?? [])]
                                                                  .sort((a, b) => {
                                                                    const mul = tradesSortDir === "asc" ? 1 : -1;
                                                                    if (tradesSortBy === "ordrqty") return mul * ((a.ordrqty ?? 0) - (b.ordrqty ?? 0));
                                                                    if (tradesSortBy === "price") return mul * ((a.price ?? 0) - (b.price ?? 0));
                                                                    return mul * (Math.abs(a.betrag) - Math.abs(b.betrag));
                                                                  })
                                                                  .map((t, idx) => (
                                                                    <tr key={idx} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                                                                      <td className="px-5 py-2">
                                                                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${t.side === "B" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                                                          {t.side === "B" ? "Buy" : "Sell"}
                                                                        </span>
                                                                      </td>
                                                                      <td className="px-5 py-2 font-mono text-neutral-400 tabular-nums">{extractTimeFromTrandattim(t.trandattim)}</td>
                                                                      <td className="px-5 py-2 font-mono text-neutral-400">{t.instmnem || "—"}</td>
                                                                      <td className="px-5 py-2 text-neutral-300 truncate max-w-[160px]" title={t.instshtnam}>{t.instshtnam || "—"}</td>
                                                                      <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{t.ordrqty != null ? formatOrdrqty(t.ordrqty) : "—"}</td>
                                                                      <td className="px-5 py-2 text-right tabular-nums text-neutral-400">{t.price != null ? formatDecimalDe(t.price) : "—"}</td>
                                                                      <td className="px-5 py-2 text-right tabular-nums text-neutral-200">{formatDecimalDe(t.betrag)}</td>
                                                                    </tr>
                                                                  ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    )}
                                                  </Fragment>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

              {/* Coin-Verlaufs-Chart */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-neutral-400">Coin-Verlauf</span>
                    <CustomSelectDropdown
                      value={selectedCoin ?? ""}
                      onChange={(v) => setSelectedCoin(v || null)}
                      options={allCoins.map((c) => ({ value: c, label: c }))}
                      placeholder="Coin wählen"
                      minWidth="120px"
                    />
                  </div>
                  <div className="flex rounded-lg border border-neutral-700 overflow-hidden text-xs">
                    {(["pct", "totalAmount", "buyAmount", "sellAmount"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setChartMetric(m)}
                        className={`px-3 py-1.5 transition-colors ${
                          chartMetric === m ? "bg-amber-500/20 text-amber-400" : "text-neutral-400 hover:bg-neutral-800"
                        }`}
                      >
                        {metricLabel[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedCoin && (
                  <p className="px-5 py-8 text-center text-neutral-500 text-sm">Coin auswählen um den Verlauf zu sehen.</p>
                )}

                {selectedCoin && coinHistory.length === 0 && (
                  <p className="px-5 py-8 text-center text-neutral-500 text-sm">Keine Daten für {selectedCoin}.</p>
                )}

                {selectedCoin && coinHistory.length > 0 && (
                  <div className="p-5">
                    {/* Balkendiagramm */}
                    <div className="flex items-end gap-2 h-48 mb-3">
                      {coinHistory.map(({ snapshot, coin }) => {
                        const val = Math.abs(coin![chartMetric]);
                        const heightPct = chartMax > 0 ? (val / chartMax) * 100 : 0;
                        const isNeg = coin!.totalAmount < 0 && chartMetric === "totalAmount";
                        return (
                          <div
                            key={snapshot.id}
                            className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                            title={`${formatDate(snapshot.snapshot_date)}: ${chartMetric === "pct" ? val.toFixed(2) + "%" : formatAmount(val)}`}
                          >
                            <span className="text-xs text-neutral-500 tabular-nums truncate w-full text-center">
                              {chartMetric === "pct" ? val.toFixed(1) + "%" : ""}
                            </span>
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor: isNeg ? "#f87171" : "#f59e0b",
                                minHeight: "2px",
                              }}
                            />
                            <span className="text-xs text-neutral-600 truncate w-full text-center">
                              {formatDate(snapshot.snapshot_date).slice(0, 5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Legende */}
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-neutral-800">
                            <th className="pb-2 text-left font-normal">Datum</th>
                            <th className="pb-2 text-right font-normal">Buy</th>
                            <th className="pb-2 text-right font-normal">Sell</th>
                            <th className="pb-2 text-right font-normal">Gesamt</th>
                            <th className="pb-2 text-right font-normal">Anteil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...coinHistory].reverse().map(({ snapshot, coin }) => (
                            <tr key={snapshot.id} className="border-b border-neutral-800/40">
                              <td className="py-1.5 text-neutral-400">{formatDate(snapshot.snapshot_date)}</td>
                              <td className="py-1.5 text-right tabular-nums text-emerald-400">{formatAmount(coin!.buyAmount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-red-400">{formatAmount(coin!.sellAmount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-amber-400">{formatAmount(coin!.totalAmount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-neutral-400">{coin!.pct.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
