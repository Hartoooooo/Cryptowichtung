/**
 * Typen für die Intraday-Musteranalyse (1 Handelstag)
 */

export type TradeSide = "BUY" | "SELL";

export interface NormalizedTrade {
  id: string;
  timestamp: number | null; // Unix ms
  timestampRaw: string | null;
  symbol: string;
  side: TradeSide;
  qty: number;
  price: number;
  notional: number;
  pnl?: number | null;
  fees?: number | null;
  tags?: string[];
  exchange?: string;
  orderId?: string;
  account?: string;
  raw: Record<string, unknown>;
}

export type BucketSize = "1m" | "5m" | "15m" | "60m";

export type SessionPhase = "Pre" | "Open" | "Mid" | "Close";

export interface BucketAggregation {
  bucketKey: number; // minuteOfDay or bucket index
  count: number;
  notionalSum: number;
  feeSum: number;
  pnlSum: number;
  tradeIds: string[];
}

export interface InsightMetrics {
  observed?: number;
  baseline?: number;
  zScore?: number;
  iqrFence?: string;
  affectedCount?: number;
  affectedNotional?: number;
  [key: string]: unknown;
}

export type InsightType =
  | "TRADE_COUNT_SPIKE"
  | "NOTIONAL_SPIKE"
  | "BURSTINESS"
  | "QUIET_PERIOD"
  | "OPEN_CLOSE_CONCENTRATION"
  | "LUNCHTIME_ANOMALY"
  | "SYMBOL_DOMINANCE_SHIFT"
  | "NOTIONAL_CONCENTRATION"
  | "FLIP_FLOP"
  | "CLONE_TRADES"
  | "FEE_CHURN"
  | "DUPLICATE_REPLAY"
  | "LOSS_STREAK"
  | "POST_LOSS_ESCALATION"
  | "SKEW_PATTERN"
  | "TIMESTAMP_ISSUES"
  | "MISSING_CORE_FIELDS";

export interface Insight {
  type: InsightType;
  severity: number; // 0-100
  confidence: number; // 0-1
  title: string;
  explanation: string;
  metrics: InsightMetrics;
  affectedTradeIds: string[];
  timeframe: { start: number | null; end: number | null }; // minuteOfDay or bucket
  params?: Record<string, number | string>;
}

export interface ParsedColumnInfo {
  timestamp: boolean;
  symbol: boolean;
  side: boolean;
  qty: boolean;
  price: boolean;
  pnl: boolean;
  fees: boolean;
  tags: boolean;
  exchange: boolean;
  orderId: boolean;
  invalidRows: number;
}
