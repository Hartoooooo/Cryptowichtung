/**
 * Intraday Baselines: Median, MAD, IQR aus dem selben Handelstag
 * Keine Multi-Day-Daten nötig.
 */

import type { BucketSize } from "./types";
import { toBucketIndex } from "./normalize";

export interface BucketStats {
  bucketKey: number;
  count: number;
  notionalSum: number;
  feeSum: number;
  pnlSum: number;
  tradeIds: string[];
}

/** Berechnet robuste Statistiken (Median, MAD, IQR) */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mad(values: number[]): number {
  const m = median(values);
  const deviations = values.map((v) => Math.abs(v - m));
  return median(deviations) || 1e-10;
}

export function iqr(values: number[]): { q1: number; q3: number; iqr: number; lower: number; upper: number } {
  if (values.length === 0) return { q1: 0, q3: 0, iqr: 0, lower: 0, upper: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  const iqrVal = q3 - q1 || 1e-10;
  const k = 1.5;
  return { q1, q3, iqr: iqrVal, lower: q1 - k * iqrVal, upper: q3 + k * iqrVal };
}

export function zScore(value: number, values: number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  const s = mad(values) * 1.4826; // MAD to std approx
  if (s < 1e-10) return 0;
  return (value - m) / s;
}

/** Aggregiert Trades in Buckets (einmalig für Performance) */
export function buildBucketStats(
  trades: { id: string; timestamp: number | null; notional: number; fees?: number | null; pnl?: number | null }[],
  bucketSize: BucketSize
): Map<number, BucketStats> {
  const map = new Map<number, BucketStats>();

  const add = (key: number, count: number, notional: number, fee: number, pnl: number, id: string) => {
    if (!map.has(key)) {
      map.set(key, { bucketKey: key, count: 0, notionalSum: 0, feeSum: 0, pnlSum: 0, tradeIds: [] });
    }
    const s = map.get(key)!;
    s.count += count;
    s.notionalSum += notional;
    s.feeSum += fee;
    s.pnlSum += pnl;
    s.tradeIds.push(id);
  };

  for (const t of trades) {
    if (t.timestamp == null) continue;
    const d = new Date(t.timestamp);
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const key = toBucketIndex(minuteOfDay, bucketSize);
    add(key, 1, t.notional, t.fees ?? 0, t.pnl ?? 0, t.id);
  }

  return map;
}

/** Pro Symbol pro Bucket: für präzise Einordnung (Uhrzeit + Kürzel) */
export interface SymbolBucketStats {
  bucketKey: number;
  symbol: string;
  count: number;
  notionalSum: number;
  tradeIds: string[];
}

export function buildSymbolBucketStats(
  trades: { id: string; timestamp: number | null; symbol: string; notional: number }[],
  bucketSize: BucketSize
): SymbolBucketStats[] {
  const map = new Map<string, SymbolBucketStats>();

  for (const t of trades) {
    if (t.timestamp == null) continue;
    const d = new Date(t.timestamp);
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const key = toBucketIndex(minuteOfDay, bucketSize);
    const mapKey = `${key}_${t.symbol}`;
    if (!map.has(mapKey)) {
      map.set(mapKey, { bucketKey: key, symbol: t.symbol, count: 0, notionalSum: 0, tradeIds: [] });
    }
    const s = map.get(mapKey)!;
    s.count += 1;
    s.notionalSum += t.notional;
    s.tradeIds.push(t.id);
  }

  return Array.from(map.values());
}

export interface GlobalBaseline {
  countValues: number[];
  notionalValues: number[];
  countMedian: number;
  countMad: number;
  countIqr: { lower: number; upper: number };
  notionalMedian: number;
  notionalMad: number;
  notionalIqr: { lower: number; upper: number };
}

export function computeGlobalBaseline(bucketStats: BucketStats[]): GlobalBaseline {
  const countValues = bucketStats.map((b) => b.count);
  const notionalValues = bucketStats.map((b) => b.notionalSum);
  const countIqrRes = iqr(countValues);
  const notionalIqrRes = iqr(notionalValues);

  return {
    countValues,
    notionalValues,
    countMedian: median(countValues),
    countMad: mad(countValues),
    countIqr: { lower: countIqrRes.lower, upper: countIqrRes.upper },
    notionalMedian: median(notionalValues),
    notionalMad: mad(notionalValues),
    notionalIqr: { lower: notionalIqrRes.lower, upper: notionalIqrRes.upper },
  };
}
