/**
 * PatternEngine: Intraday-Musteranalyse für 1 Handelstag
 * Performance-optimiert für große Tagesdateien (50k–500k Trades)
 */

import type { NormalizedTrade, BucketSize, Insight, ParsedColumnInfo } from "./types";
import { csvRowToTrade } from "./normalize";
import { buildBucketStats, buildSymbolBucketStats, computeGlobalBaseline } from "./baselines";
import { runAllInsights } from "./insights";

export * from "./types";
export * from "./normalize";
export * from "./baselines";
export * from "./insights";

export interface PatternEngineInput {
  trades: NormalizedTrade[];
  bucketSize?: BucketSize;
}

export interface PatternEngineResult {
  insights: Insight[];
  bucketStats: Map<number, { bucketKey: number; count: number; notionalSum: number; feeSum: number; pnlSum: number; tradeIds: string[] }>;
  totalNotional: number;
  tradeCount: number;
  dayWarning: string | null;
  columnInfo: ParsedColumnInfo;
}

/** Validiert: alle Trades im selben Tag (optional) */
function checkSingleDay(trades: NormalizedTrade[]): string | null {
  const withTs = trades.filter((t) => t.timestamp != null);
  if (withTs.length < 2) return null;

  const dates = new Set(withTs.map((t) => new Date(t.timestamp!).toDateString()));
  if (dates.size > 1) {
    return `Trades stammen von ${dates.size} verschiedenen Tagen. Analyse läuft trotzdem mit Tages-Baselines.`;
  }
  return null;
}

export function runPatternEngine(input: PatternEngineInput): PatternEngineResult {
  const { trades, bucketSize = "15m" } = input;

  const totalNotional = trades.reduce((s, t) => s + t.notional, 0);
  const hasPnl = trades.some((t) => t.pnl != null);
  const hasFees = trades.some((t) => t.fees != null);
  const hasTimestamps = trades.some((t) => t.timestamp != null);

  const bucketStatsMap = buildBucketStats(trades, bucketSize);
  const bucketStatsArr = Array.from(bucketStatsMap.values());
  const globalBaseline = computeGlobalBaseline(bucketStatsArr);
  const symbolBucketStats = buildSymbolBucketStats(trades, bucketSize);

  const ctx = {
    trades,
    bucketStats: bucketStatsMap,
    symbolBucketStats,
    globalBaseline,
    bucketSize,
    totalNotional,
    hasPnl,
    hasFees,
    hasTimestamps,
  };

  const insights = runAllInsights(ctx);
  const dayWarning = checkSingleDay(trades);

  const columnInfo: ParsedColumnInfo = {
    timestamp: hasTimestamps,
    symbol: trades.every((t) => t.symbol && t.symbol !== "?"),
    side: true,
    qty: trades.some((t) => t.qty > 0),
    price: trades.some((t) => t.price > 0),
    pnl: hasPnl,
    fees: hasFees,
    tags: trades.some((t) => t.tags && t.tags.length > 0),
    exchange: trades.some((t) => t.exchange),
    orderId: trades.some((t) => t.orderId),
    invalidRows: 0,
  };

  return {
    insights,
    bucketStats: bucketStatsMap,
    totalNotional,
    tradeCount: trades.length,
    dayWarning,
    columnInfo,
  };
}

/** Konvertiert Auswertungs-CsvRows zu NormalizedTrades */
export function csvRowsToTrades(
  rows: Array<{ isincod: string; betrag: number; side: "B" | "S"; instmnem?: string; trandattim?: string; iban?: string }>
): NormalizedTrade[] {
  return rows.map((r, i) => csvRowToTrade(r, i));
}
