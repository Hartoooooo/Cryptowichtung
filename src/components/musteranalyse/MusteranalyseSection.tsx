"use client";

import { useState, useMemo, useCallback } from "react";
import type { NormalizedTrade, BucketSize, Insight } from "@/lib/pattern-engine/types";
import { runPatternEngine, csvRowsToTrades } from "@/lib/pattern-engine";
import HeatmapChart, { type HeatmapBucket } from "./HeatmapChart";
import InsightCard from "./InsightCard";
import InsightDetailDrawer from "./InsightDetailDrawer";

interface CsvRowForMusteranalyse {
  isincod: string;
  betrag: number;
  side: "B" | "S";
  instmnem?: string;
  trandattim?: string;
  iban?: string;
}

interface MusteranalyseSectionProps {
  csvRows: CsvRowForMusteranalyse[];
}

function exportTradesToCsv(trades: NormalizedTrade[], ids: string[]) {
  const subset = trades.filter((t) => ids.includes(t.id));
  const headers = ["id", "timestamp", "symbol", "side", "qty", "price", "notional", "pnl", "fees"];
  const rows = subset.map((t) =>
    [
      t.id,
      t.timestamp ? new Date(t.timestamp).toISOString() : "",
      t.symbol,
      t.side,
      t.qty,
      t.price,
      t.notional,
      t.pnl ?? "",
      t.fees ?? "",
    ].join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `musteranalyse-trades-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MusteranalyseSection({ csvRows }: MusteranalyseSectionProps) {
  const [bucketSize, setBucketSize] = useState<BucketSize>("15m");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | "BUY" | "SELL">("all");
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  const trades = useMemo(() => csvRowsToTrades(csvRows), [csvRows]);

  const filteredTrades = useMemo(() => {
    let out = trades;
    if (symbolFilter.trim()) {
      const q = symbolFilter.toLowerCase();
      out = out.filter((t) => t.symbol.toLowerCase().includes(q));
    }
    if (sideFilter !== "all") {
      out = out.filter((t) => t.side === sideFilter);
    }
    return out;
  }, [trades, symbolFilter, sideFilter]);

  const result = useMemo(() => {
    if (filteredTrades.length === 0) return null;
    return runPatternEngine({ trades: filteredTrades, bucketSize });
  }, [filteredTrades, bucketSize]);

  const heatmapBuckets = useMemo((): HeatmapBucket[] => {
    if (!result) return [];
    const bucketMinutes = { "1m": 1, "5m": 5, "15m": 15, "60m": 60 }[bucketSize];
    const byHour = new Map<number, { count: number; notional: number }>();
    for (let h = 0; h < 24; h++) byHour.set(h, { count: 0, notional: 0 });

    for (const [, stats] of result.bucketStats) {
      const minuteOfDay = stats.bucketKey * bucketMinutes;
      const hour = Math.min(23, Math.floor(minuteOfDay / 60));
      const cur = byHour.get(hour)!;
      cur.count += stats.count;
      cur.notional += stats.notionalSum;
    }

    return Array.from(byHour.entries()).map(([hour, { count, notional }]) => ({
      hour,
      count,
      notional,
    }));
  }, [result, bucketSize]);

  const [heatmapMode, setHeatmapMode] = useState<"count" | "notional">("count");
  const topInsights = useMemo(() => (result?.insights ?? []).slice(0, 5), [result]);

  const handleExport = useCallback(
    (ids: string[]) => {
      exportTradesToCsv(filteredTrades, ids);
    },
    [filteredTrades]
  );

  // Nur anzeigen wenn CSV geladen
  if (csvRows.length === 0) return null;

  return (
    <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-800">
        <h2 className="text-lg font-medium text-neutral-100">Musteranalyse</h2>
        <p className="text-sm text-neutral-500">Intraday-Muster und Anomalien für 1 Handelstag</p>
      </div>

      {result?.dayWarning && (
        <div className="mx-5 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {result.dayWarning}
        </div>
      )}

      <div className="px-5 py-4 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Bucket:</span>
            <select
              value={bucketSize}
              onChange={(e) => setBucketSize(e.target.value as BucketSize)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="60m">60m</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Symbol:</span>
            <input
              type="text"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              placeholder="Filter..."
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 w-32"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Side:</span>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value as "all" | "BUY" | "SELL")}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
            >
              <option value="all">Alle</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </div>
        </div>

        {/* Heatmap */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-400">Tagesverlauf</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHeatmapMode("count")}
                className={`rounded px-2 py-1 text-xs ${heatmapMode === "count" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"}`}
              >
                Trades
              </button>
              <button
                type="button"
                onClick={() => setHeatmapMode("notional")}
                className={`rounded px-2 py-1 text-xs ${heatmapMode === "notional" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"}`}
              >
                Notional
              </button>
            </div>
          </div>
          <HeatmapChart buckets={heatmapBuckets} mode={heatmapMode} />
        </div>

        {/* Top 5 Insights */}
        <div>
          <h3 className="text-sm font-medium text-neutral-400 mb-3">Top Insights (höchste Severity)</h3>
          <div className="space-y-2">
            {topInsights.length === 0 ? (
              <p className="text-sm text-neutral-500">Keine Auffälligkeiten erkannt.</p>
            ) : (
              topInsights.map((insight) => (
                <InsightCard
                  key={`${insight.type}-${insight.timeframe.start}-${insight.timeframe.end}`}
                  insight={insight}
                  onClick={() => setSelectedInsight(insight)}
                />
              ))
            )}
          </div>
        </div>

        {result && result.insights.length > 5 && (
          <p className="text-xs text-neutral-500">
            +{result.insights.length - 5} weitere Insights
          </p>
        )}
      </div>

      <InsightDetailDrawer
        insight={selectedInsight}
        trades={filteredTrades}
        onClose={() => setSelectedInsight(null)}
        onExport={handleExport}
      />
    </div>
  );
}
