/**
 * Day-aware Normalization: Validiert 1 Handelstag, erzeugt intraday Features
 * Robust gegen verschiedene Timestamp-, Spalten- und Format-Varianten.
 */

import type { NormalizedTrade, BucketSize, SessionPhase, ParsedColumnInfo } from "./types";

const EPSILON = 1e-10;

/** Parst Timestamp: ISO, UNIX (ms/s), Locale (DD.MM.YYYY HH:mm) */
export function parseTimestamp(raw: string | undefined): { ms: number | null; minuteOfDay: number | null } {
  if (!raw || !String(raw).trim()) return { ms: null, minuteOfDay: null };
  const s = String(raw).trim();

  // UNIX ms
  const unixMs = /^\d{12,}$/.test(s) ? parseInt(s, 10) : null;
  if (unixMs != null && !isNaN(unixMs)) {
    const d = new Date(unixMs);
    return { ms: unixMs, minuteOfDay: d.getHours() * 60 + d.getMinutes() };
  }

  // UNIX seconds
  const unixSec = /^\d{9,10}$/.test(s) ? parseInt(s, 10) * 1000 : null;
  if (unixSec != null && !isNaN(unixSec)) {
    const d = new Date(unixSec);
    return { ms: unixSec, minuteOfDay: d.getHours() * 60 + d.getMinutes() };
  }

  // ISO / Date.parse
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return { ms: parsed, minuteOfDay: d.getHours() * 60 + d.getMinutes() };
  }

  // Nur Zeit HH:mm oder HH:mm:ss
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeOnly) {
    const h = parseInt(timeOnly[1], 10) || 0;
    const m = parseInt(timeOnly[2], 10) || 0;
    const min = Math.min(1439, Math.max(0, h * 60 + m));
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return { ms: d.getTime(), minuteOfDay: min };
  }

  // Datum+Zeit DD.MM.YYYY HH:mm oder YYYY-MM-DD HH:mm
  const dtMatch = s.match(/(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\s+(\d{1,2}):(\d{2})/);
  if (dtMatch) {
    const [, d1, d2, y, h, min] = dtMatch;
    const year = parseInt(y, 10);
    const yr = year > 100 ? year : 2000 + (year % 100);
    const month = parseInt(d2, 10) - 1;
    const day = parseInt(d1, 10);
    const hour = parseInt(h, 10);
    const minute = parseInt(min, 10);
    const date = new Date(yr, month, day, hour, minute, 0, 0);
    const ms = date.getTime();
    const mod = hour * 60 + minute;
    return { ms, minuteOfDay: mod };
  }

  return { ms: null, minuteOfDay: null };
}

function parseNum(val: string | number | undefined): number | null {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const cleaned = String(val).trim().replace(/['"]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned.replace(/\s/g, ""));
  return isNaN(n) ? null : n;
}

/** Ermittelt SessionPhase aus minuteOfDay (lokale TZ, Europa: Open ~9, Close ~17) */
export function getSessionPhase(minuteOfDay: number): SessionPhase {
  const hour = Math.floor(minuteOfDay / 60);
  if (hour < 8) return "Pre";
  if (hour < 10) return "Open";
  if (hour >= 16) return "Close";
  return "Mid";
}

/** Formatiert Bucket-Key als Uhrzeit-Bereich (z.B. "14:30–14:45") */
export function bucketKeyToTimeRange(bucketKey: number, bucketSize: BucketSize): string {
  const mins: Record<BucketSize, number> = { "1m": 1, "5m": 5, "15m": 15, "60m": 60 };
  const m = mins[bucketSize];
  const startMin = bucketKey * m;
  const endMin = startMin + m;
  const h1 = Math.floor(startMin / 60);
  const h2 = Math.floor(endMin / 60);
  const min1 = startMin % 60;
  const min2 = endMin % 60;
  const fmt = (h: number, min: number) =>
    `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return `${fmt(h1, min1)}–${fmt(h2, min2)}`;
}

/** Bucket-Index aus minuteOfDay je nach BucketSize */
export function toBucketIndex(minuteOfDay: number, bucketSize: BucketSize): number {
  switch (bucketSize) {
    case "1m":
      return minuteOfDay;
    case "5m":
      return Math.floor(minuteOfDay / 5);
    case "15m":
      return Math.floor(minuteOfDay / 15);
    case "60m":
      return Math.floor(minuteOfDay / 60);
    default:
      return Math.floor(minuteOfDay / 15);
  }
}

/** Konvertiert Raw-Row zu NormalizedTrade (generisches CSV-Format) */
export function normalizeRow(
  row: Record<string, unknown>,
  index: number,
  headers: string[]
): { trade: NormalizedTrade; parsed: Partial<ParsedColumnInfo> } {
  const get = (keys: string[]) => {
    for (const k of keys) {
      const idx = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === k.replace(/[^a-z0-9]/g, ""));
      if (idx >= 0 && row[headers[idx]] != null) return row[headers[idx]];
    }
    return undefined;
  };

  const tsRaw = get(["timestamp", "time", "datetime", "date", "trandattim"]) as string | undefined;
  const { ms, minuteOfDay } = parseTimestamp(tsRaw);

  const symbolRaw = get(["symbol", "instmnem", "ticker", "instrument"]);
  const symbol = (symbolRaw != null ? String(symbolRaw).trim() : "") || (get(["isincod", "isin"]) as string) || "?";

  const sideRaw = (get(["side", "ordrbuycod", "buysell"]) as string)?.toUpperCase() || "";
  const side: "BUY" | "SELL" =
    sideRaw === "S" || sideRaw === "SELL" || sideRaw === "Sell"
      ? "SELL"
      : "BUY";

  const qty = parseNum(get(["qty", "quantity", "amount", "size"]) as string) ?? 0;
  const price = parseNum(get(["price", "px", "preis"]) as string) ?? 0;
  const betrag = parseNum(get(["betrag", "amount", "wert", "notional"]) as string);

  let notional = 0;
  if (qty > 0 && price > 0) {
    notional = qty * price;
  } else if (betrag != null && betrag !== 0) {
    notional = Math.abs(betrag);
  } else if (qty > 0 || price > 0) {
    notional = Math.max(qty * price, 0);
  }

  const pnl = parseNum(get(["pnl", "profit", "realizedpnl"]) as string) ?? null;
  const fees = parseNum(get(["fees", "fee", "commission"]) as string) ?? null;

  const tags: string[] = [];
  const tagVal = get(["tags", "tag"]);
  if (Array.isArray(tagVal)) tags.push(...tagVal.map(String));
  else if (tagVal != null) tags.push(String(tagVal));

  const exchange = (get(["exchange"]) as string)?.trim() ?? "";
  const orderId = (get(["orderid", "order_id"]) as string)?.trim() ?? "";
  const account = (get(["account", "iban", "ordraccount"]) as string)?.trim() ?? "";

  const feeRatio = fees != null && notional > EPSILON ? fees / notional : 0;

  return {
    trade: {
      id: `t${index}`,
      timestamp: ms,
      timestampRaw: tsRaw ?? null,
      symbol,
      side,
      qty,
      price,
      notional,
      pnl: pnl ?? undefined,
      fees: fees ?? undefined,
      tags,
      exchange,
      orderId,
      account,
      raw: { ...row },
    },
    parsed: {
      timestamp: tsRaw != null,
      symbol: symbol !== "?",
      side: true,
      qty: qty > 0,
      price: price > 0,
      pnl: pnl != null,
      fees: fees != null,
      tags: tags.length > 0,
      exchange: !!exchange,
      orderId: !!orderId,
    },
  };
}

/** Konvertiert Auswertungs-CsvRow zu NormalizedTrade (bestehendes Format) */
export function csvRowToTrade(
  row: {
    isincod: string;
    betrag: number;
    side: "B" | "S";
    instmnem?: string;
    instshtnam?: string;
    iban?: string;
    trandattim?: string;
  },
  index: number
): NormalizedTrade {
  const { ms, minuteOfDay } = parseTimestamp(row.trandattim);
  const symbol = (row.instmnem || row.isincod || "?").trim();
  const side: "BUY" | "SELL" = row.side === "S" ? "SELL" : "BUY";
  const notional = Math.abs(row.betrag);

  return {
    id: `t${index}`,
    timestamp: ms ?? null,
    timestampRaw: row.trandattim ?? null,
    symbol,
    side,
    qty: 0,
    price: 0,
    notional,
    raw: row as unknown as Record<string, unknown>,
    account: row.iban || undefined,
  };
}
